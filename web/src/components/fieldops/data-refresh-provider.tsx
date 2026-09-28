"use client";

import { toast } from "sonner";
import { SessionExpiredError, withApiRequestBatch } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Loader = () => Promise<unknown>;
type RefreshContext = {
  register: (loader: Loader) => () => void;
  refresh: () => Promise<void>;
  refreshing: boolean;
};
const Context = createContext<RefreshContext | null>(null);

/** Coordinates existing mounted loaders; owns no server-data cache or page state. */
export function DataRefreshProvider({ children }: { children: ReactNode }) {
  const loaders = useRef(new Set<Loader>());
  const running = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const pathname = usePathname();
  const route = useRef(pathname);
  useEffect(() => { route.current = pathname; }, [pathname]);
  const router = useRouter();
  const register = useCallback((loader: Loader) => {
    loaders.current.add(loader);
    return () => { loaders.current.delete(loader); };
  }, []);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    const startedOn = route.current;
    try {
      const results = await withApiRequestBatch(() =>
        Promise.allSettled([...loaders.current].map((load) => Promise.resolve().then(load))),
      );
      if (startedOn !== route.current) return;
      if (results.some((result) => result.status === "rejected" && result.reason instanceof SessionExpiredError)) {
        router.replace("/login?reason=session-expired");
      } else if (results.some((result) => result.status === "rejected")) {
        toast.error("Some data couldn't be refreshed. Please try again.", { id: "refresh-data" });
      }
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, [router]);
  return (
    <Context.Provider value={{ register, refresh, refreshing }}>
      {children}
    </Context.Provider>
  );
}

export function useRefreshLoader(loader: Loader) {
  const context = useContext(Context);
  const latest = useRef(loader);
  useEffect(() => { latest.current = loader; });
  const register = context?.register;
  useEffect(() => register?.(() => latest.current()), [register]);
}

export function useDataRefresh() {
  return useContext(Context);
}
