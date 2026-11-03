/**
 * Backend-only lease heartbeat while a provider call is in flight.
 * Stops when stop() is called or when a tick reports lost ownership.
 */

export type ExecutionHeartbeatOptions = {
  /** Interval between heartbeats (ms). Default callers use ~60_000. */
  intervalMs: number;
  /** Returns false when ownership/lease is lost. */
  tick: () => Promise<boolean>;
  onLostOwnership?: () => void;
};

export type ExecutionHeartbeatHandle = {
  stop: () => void;
  /** True once a tick failed or stop was called after ownership loss. */
  didLoseOwnership: () => boolean;
};

export function startExecutionHeartbeat(
  options: ExecutionHeartbeatOptions,
): ExecutionHeartbeatHandle {
  let stopped = false;
  let lostOwnership = false;
  let inFlight = false;

  const runTick = async () => {
    if (stopped || lostOwnership || inFlight) return;
    inFlight = true;
    try {
      const ok = await options.tick();
      if (!ok) {
        lostOwnership = true;
        stopped = true;
        clearInterval(timer);
        options.onLostOwnership?.();
      }
    } catch {
      lostOwnership = true;
      stopped = true;
      clearInterval(timer);
      options.onLostOwnership?.();
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => {
    void runTick();
  }, options.intervalMs);
  // Avoid keeping the process awake solely for heartbeats in edge runtimes.
  timer.unref?.();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    didLoseOwnership: () => lostOwnership,
  };
}
