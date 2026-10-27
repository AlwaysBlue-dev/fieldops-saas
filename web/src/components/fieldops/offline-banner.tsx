"use client";

import {
  getOnlineSnapshot,
  subscribeConnectivity,
} from "@/lib/offline/connectivity";
import { useEffect, useState } from "react";

/** Live reachability (API probe), not navigator.onLine alone. */
export function useOnlineStatus() {
  const [online, setOnline] = useState(getOnlineSnapshot);

  useEffect(() => subscribeConnectivity(setOnline), []);

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
