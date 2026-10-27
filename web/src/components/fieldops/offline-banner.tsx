"use client";

import { useEffect, useState } from "react";

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const sync = () =>
      setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    // DevTools "Offline" and some browsers miss events; re-check on focus.
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = window.setInterval(sync, 2000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      window.clearInterval(timer);
    };
  }, []);

  return online;
}

export function OfflineBanner({
  message = "You’re offline. Prepared My Day jobs and queued field changes stay on this device and sync when you reconnect. Dispatch, approvals, billing, and other live server actions still need a connection.",
}: {
  message?: string;
}) {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-6"
    >
      <p className="font-semibold">Offline</p>
      <p className="mt-0.5 opacity-90">{message}</p>
    </div>
  );
}
