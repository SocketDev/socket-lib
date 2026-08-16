/**
 * @file Task-to-backend routing. Reasoning-heavy repair tasks systematically
 *   fail on the small on-device model, so they route to a heavier backend while
 *   everything else stays on the built-in on-device model.
 */

export const REASONING_HEAVY_TASKS: Set<string> = new Set([
  'code-repair',
  'code-repair-lint-errors',
])

export interface BackendForTaskOptions {
  heavyBackend?: string | undefined
}

/**
 * Pick the backend for a task. Reasoning-heavy tasks route to the heavy backend
 * (`llama-server` by default, overridable via `options.heavyBackend`); every
 * other task stays on the built-in on-device backend.
 */
export function backendForTask(
  taskName: string,
  options?: BackendForTaskOptions | undefined,
): string {
  const opts = { __proto__: null, ...options } as BackendForTaskOptions
  if (REASONING_HEAVY_TASKS.has(taskName)) {
    return opts.heavyBackend ?? 'llama-server'
  }
  return 'chrome-builtin'
}
