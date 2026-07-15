/**
 * @file Platform-aware spawn-timeout scaling. Windows process creation is much
 *   slower than POSIX — a `.cmd`/`.bat` shim launches through cmd.exe and there
 *   is no cheap fork — and parallel CI load amplifies it, so a timeout that is
 *   fine on POSIX can kill a slow-but-alive LOCAL process. `spawnTimeoutMs`
 *   scales a LOCAL timeout up on win32; POSIX keeps the base. It is NOT for a
 *   NETWORK timeout: that must stay bounded so a blackout can't hang the
 *   caller, and scaling a network budget by platform is wrong — a network spawn
 *   keeps a fixed `timeout`. The spawn API surfaces this as the `localTimeout`
 *   option (platform-scaled) vs `timeout` (fixed); `resolveSpawnTimeout` picks
 *   between them.
 */

// Default win32 spawn-timeout multiplier. A win32 spawn runs single-digit-x
// slower than POSIX under CI load; 6x turns the common 5s probe into 30s while
// POSIX stays at the base. Env-overridable for an unusually slow/fast runner.
// Exported (like everything in src/) so a test can assert the default directly.
export const DEFAULT_WIN32_SPAWN_TIMEOUT_MULTIPLIER = 6

/**
 * The win32 spawn-timeout multiplier. Reads `SOCKET_SPAWN_TIMEOUT_MULTIPLIER`
 * when it parses to a positive finite number, else the default (6). This is the
 * config-adaptive knob: a known-slow runner tunes it via env, no code change.
 */
export function getWin32SpawnTimeoutMultiplier(): number {
  const raw = process.env['SOCKET_SPAWN_TIMEOUT_MULTIPLIER']
  const parsed = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_WIN32_SPAWN_TIMEOUT_MULTIPLIER
}

/**
 * Resolve the effective process-kill timeout from a spawn options bag.
 * `localTimeout` (platform-scaled) takes the place of `timeout` (fixed);
 * passing BOTH is a caller error and throws. Returns `undefined` when neither
 * is set (Node's default: no timeout).
 */
export function resolveSpawnTimeout(options: {
  localTimeout?: number | undefined
  timeout?: number | undefined
}): number | undefined {
  const { localTimeout, timeout } = {
    __proto__: null,
    ...options,
  } as typeof options
  if (localTimeout !== undefined) {
    if (timeout !== undefined) {
      throw new TypeError(
        'spawn: pass either `timeout` (fixed) or `localTimeout` (platform-scaled), not both',
      )
    }
    return spawnTimeoutMs(localTimeout)
  }
  return timeout
}

/**
 * Scale a LOCAL process-spawn timeout for the current platform. Returns
 * `baseMs` unchanged off Windows; on Windows multiplies by the win32 multiplier
 * (default 6, env-overridable) to absorb slower process-creation latency. An
 * absent binary still fails fast (ENOENT), so the wider ceiling only extends
 * patience for a present-but-slow process — never the missing-binary case.
 */
export function spawnTimeoutMs(baseMs: number): number {
  // Inline the platform check (not the module-cached WIN32 constant) so tests
  // can flip `process.platform` per case and cover both branches — this mirrors
  // the same inline in child.ts.
  return process.platform === 'win32'
    ? baseMs * getWin32SpawnTimeoutMultiplier()
    : baseMs
}
