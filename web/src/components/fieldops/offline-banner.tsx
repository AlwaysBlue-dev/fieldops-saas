"use client";

import { useEffect, useState } from "react";

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () =>
      setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}

export function OfflineBanner({
  message = "You’re offline. Operational actions need a connection — jobs, time, photos, and approvals won’t save until you’re back online.",
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
