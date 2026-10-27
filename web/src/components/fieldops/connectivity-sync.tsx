"use client";

import { startConnectivitySync } from "@/lib/offline/sync-engine";
import { useEffect } from "react";

/**
 * Keeps offline queue sync listening for reconnect anywhere in the app shell
 * (not only on My Day where OfflineFieldBar mounts).
 */
export function ConnectivitySync({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  useEffect(() => {
    return startConnectivitySync(organizationId, userId);
  }, [organizationId, userId]);

  return null;
}
