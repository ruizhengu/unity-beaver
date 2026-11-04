// Drives one compile cycle in Unity and returns the console entries afterwards.
//
// Unity gives no "refresh finished" signal, so this polls /ping:
//   1. Ask Unity to refresh the AssetDatabase (picks up changed .cs files).
//   2. Wait briefly for compilation to start.
//   3. Wait until it ends. A successful compile triggers a domain reload, which
//      restarts the server: losing the connection and getting it back means
//      the reload finished. A failed compile doesn't reload, so isCompiling
//      just flips back to false.
//   4. Give Unity a moment to write errors to the console, then read them.
//
// These timings match the original CLI and were tuned against real Editors.
// Change them only with a Unity Editor at hand to test against.

export const DEFAULT_TIMINGS = Object.freeze({
  pollMs: 500,
  startPolls: 15, // ~7.5s to notice compilation starting
  settleMs: 1000,
  reloadTimeoutMs: 60_000,
});

export class ReloadTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Unity didn't come back within ${Math.round(timeoutMs / 1000)}s after reloading scripts`);
    this.name = 'ReloadTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {ReturnType<import('./bridge.js').createBridge>} bridge
 * @param {{ timings?: Partial<typeof DEFAULT_TIMINGS>, onPhase?: (phase: string) => void }} [options]
 */
export async function compileAndCollect(bridge, { timings = {}, onPhase = () => {} } = {}) {
  const t = { ...DEFAULT_TIMINGS, ...timings };

  onPhase('refreshing');
  await bridge.refresh(); // a failure here means Unity isn't reachable at all

  onPhase('waiting');
  let compiling = false;
  for (let i = 0; i < t.startPolls && !compiling; i++) {
    await sleep(t.pollMs);
    try {
      compiling = Boolean((await bridge.ping()).isCompiling);
    } catch {
      compiling = true; // the server went away: a domain reload has started
    }
  }

  let disconnectedAt = null;
  while (compiling) {
    try {
      const status = await bridge.ping();
      // Reconnecting after a disconnect means the domain reload finished.
      compiling = disconnectedAt === null && Boolean(status.isCompiling);
      disconnectedAt = null;
      if (compiling) onPhase('compiling');
    } catch {
      disconnectedAt ??= Date.now();
      onPhase('reloading');
      if (Date.now() - disconnectedAt > t.reloadTimeoutMs) throw new ReloadTimeoutError(t.reloadTimeoutMs);
    }
    if (compiling || disconnectedAt !== null) await sleep(t.pollMs);
  }

  onPhase('reading');
  await sleep(t.settleMs);
  return bridge.compileErrors();
}
