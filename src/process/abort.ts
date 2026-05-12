/**
 * @fileoverview Process control helpers.
 * Lazily creates and exposes a shared `AbortController` and its `AbortSignal`
 * so cooperating modules can coordinate cancellation from a single source.
 */

// Abort controller and signal.
let _abortController: AbortController
/**
 * Get the process-scoped shared `AbortController` singleton.
 * Cooperating modules use this to coordinate cancellation across the library.
 *
 * @returns The lazily-created shared `AbortController` instance.
 */
export function getAbortController(): AbortController {
  if (_abortController === undefined) {
    _abortController = new AbortController()
  }
  return _abortController
}

/**
 * Get the process-scoped shared `AbortSignal` singleton.
 * This is the `signal` property of {@link getAbortController}'s controller and
 * is intended to be passed to APIs that accept an `AbortSignal`.
 *
 * @returns The shared `AbortSignal` instance.
 */
export function getAbortSignal(): AbortSignal {
  return getAbortController().signal
}
