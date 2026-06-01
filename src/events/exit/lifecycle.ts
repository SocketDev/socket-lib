/**
 * @file `load` and `unload` — install and remove the `signal-exit` listeners.
 *   Co-located with `getSignalListeners` because the per-signal listener body
 *   calls `unload()`; keeping them in the same leaf avoids an inter-leaf import
 *   cycle.
 */

import {
  WIN32,
  emit,
  getEmitter,
  getSignals,
  globalProcess,
  isLoaded,
  originalProcessEmit,
  originalProcessReallyExit,
  setLoaded,
  setSignals,
} from './_internal'
import { processEmit, processReallyExit } from './intercept'

import type { SignalListener, SignalListenerMap } from './types'

let _sigListeners: SignalListenerMap | undefined

export function getSignalListeners() {
  if (_sigListeners === undefined) {
    _sigListeners = { __proto__: null } as unknown as SignalListenerMap
    const emitter = getEmitter()
    const sigs = getSignals()
    /* c8 ignore start - Signal-listener body fires only on real
       process signals; can't be triggered in-test without subprocess
       infrastructure. */
    for (const sig of sigs) {
      _sigListeners[sig] = function listener() {
        // If there are no other listeners, an exit is coming!
        // Simplest way: remove us and then re-send the signal.
        // We know that this will kill the process, so we can
        // safely emit now.
        const listeners = globalProcess?.listeners(sig as NodeJS.Signals) || []
        if (listeners.length === emitter.count) {
          unload()
          emit('exit', undefined, sig)
          emit('afterexit', undefined, sig)
          // "SIGHUP" throws an `ENOSYS` error on Windows,
          // so use a supported signal instead.
          const killSig = WIN32 && sig === 'SIGHUP' ? 'SIGINT' : sig
          globalProcess?.kill(globalProcess?.pid, killSig)
        }
      }
    }
    /* c8 ignore stop */
  }
  return _sigListeners as SignalListenerMap
}

/**
 * Load signal handlers and hook into process exit events.
 *
 * @example
 *   ;```typescript
 *   load()
 *   // Signal handlers are now active
 *   ```
 */
export function load(): void {
  /* c8 ignore next - !globalProcess never fires in Node tests. */
  if (isLoaded() || !globalProcess) {
    return
  }
  setLoaded(true)
  // Capture into a local so the filter callback below narrows correctly.
  const proc = globalProcess

  // This is the number of onSignalExit's that are in play.
  // It's important so that we can count the correct number of
  // listeners on signals, and don't wait for the other one to
  // handle it instead of us.
  const emitter = getEmitter()
  // emitter.count is always defined after getEmitter() init (set to 0).
  /* c8 ignore start */
  if (emitter.count !== undefined) {
    emitter.count += 1
  }
  /* c8 ignore stop */

  const sigs = getSignals()
  const sigListeners = getSignalListeners()
  setSignals(
    sigs.filter(sig => {
      try {
        proc.on(sig as NodeJS.Signals, sigListeners[sig] as SignalListener)
        return true
        /* c8 ignore start - process.on rarely throws on standard signals. */
      } catch {}
      return false
      /* c8 ignore stop */
    }),
  )

  proc.emit = processEmit as typeof proc.emit
  proc.reallyExit = processReallyExit
}

/**
 * Unload signal handlers and restore original process behavior.
 *
 * @example
 *   ;```typescript
 *   unload()
 *   // Signal handlers are now removed
 *   ```
 */
export function unload(): void {
  // !globalProcess never fires in Node tests.
  /* c8 ignore start */
  if (!isLoaded() || !globalProcess) {
    return
  }
  /* c8 ignore stop */
  setLoaded(false)

  const sigs = getSignals()
  const sigListeners = getSignalListeners()
  for (const sig of sigs) {
    try {
      globalProcess.removeListener(
        sig as NodeJS.Signals,
        sigListeners[sig] as SignalListener,
      )
      /* c8 ignore start - removeListener rarely throws. */
    } catch {}
    /* c8 ignore stop */
  }
  globalProcess.emit = originalProcessEmit as typeof globalProcess.emit
  // originalProcessReallyExit is always defined in Node runtimes;
  // the undefined branch only fires under exotic embedders.
  /* c8 ignore start */
  if (originalProcessReallyExit !== undefined) {
    globalProcess.reallyExit = originalProcessReallyExit
  }
  /* c8 ignore stop */
  const emitter = getEmitter()
  // emitter.count is always defined after init.
  /* c8 ignore start */
  if (emitter.count !== undefined) {
    emitter.count -= 1
  }
  /* c8 ignore stop */
}
