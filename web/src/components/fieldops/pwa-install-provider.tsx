"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isStandaloneDisplay,
  prefersIosInstallInstructions,
  type BeforeInstallPromptEventLike,
} from "@/lib/pwa";

type InstallOutcome = "accepted" | "dismissed" | "unavailable" | "standalone";

type PwaInstallContextValue = {
  /** Running as installed PWA (standalone / iOS home screen). */
  isInstalled: boolean;
  /** Chromium deferred install prompt is available. */
  canPromptInstall: boolean;
  /** Show Share → Add to Home Screen guidance. */
  needsIosInstructions: boolean;
  /** Capture-only; never auto-prompt. */
  promptInstall: () => Promise<InstallOutcome>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEventLike | null>(
    null,
  );
  const [needsIosInstructions, setNeedsIosInstructions] = useState(false);

  useEffect(() => {
    const sync = () => {
      const standalone = isStandaloneDisplay();
      setIsInstalled(standalone);
      setNeedsIosInstructions(prefersIosInstallInstructions());
    };
    sync();

    const media = window.matchMedia("(display-mode: standalone)");
    const onChange = () => sync();
    media.addEventListener("change", onChange);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEventLike);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsInstalled(true);
      setNeedsIosInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (isStandaloneDisplay()) return "standalone";
    if (!deferred) return "unavailable";
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        return "accepted";
      }
      return "dismissed";
    } catch {
      setDeferred(null);
      return "unavailable";
    }
  }, [deferred]);

  const value = useMemo<PwaInstallContextValue>(
    () => ({
      isInstalled,
      canPromptInstall: Boolean(deferred) && !isInstalled,
      needsIosInstructions: needsIosInstructions && !isInstalled,
      promptInstall,
    }),
    [isInstalled, deferred, needsIosInstructions, promptInstall],
  );

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider");
  }
  return ctx;
}

/** Safe hook when provider may be absent (e.g. marketing pages). */
export function usePwaInstallOptional() {
  return useContext(PwaInstallContext);
}
