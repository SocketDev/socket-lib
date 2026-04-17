/**
 * @fileoverview Process control helpers.
 * Lazily creates and exposes a shared `AbortController` and its `AbortSignal`
 * so cooperating modules can coordinate cancellation from a single source.
 */

// Abort controller and signal.
let _abortController: AbortController
export function getAbortController(): AbortController {
  if (_abortController === undefined) {
    _abortController = new AbortController()
  }
  return _abortController
}

export function getAbortSignal(): AbortSignal {
  return getAbortController().signal
}
