/**
 * @file `onExit` — register a callback for process exit / signal. Triggers
 *   `load()` on first call. Returns a remover that unregisters the callback and
 *   calls `unload()` once both `exit` and `afterexit` listener lists empty
 *   out.
 */

import { TypeErrorCtor } from '../../primordials/error'

import { getEmitter, globalProcess, isLoaded } from './_internal'
import { load, unload } from './lifecycle'

import type { OnExitOptions } from './types'

/**
 * Register a callback to run on process exit or signal.
 *
 * @example
 *   ```typescript
 *   const remove = onExit((code, signal) => {
 *   console.log(`Exiting with code ${code}, signal ${signal}`)
 *   })
 *   // Later, to unregister:
 *   remove()
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function onExit(
  // oxlint-disable-next-line socket/prefer-undefined-over-null -- mirrors upstream signal-exit API (signal/code are `null` for non-signal/non-exit events).
  cb: (code: number | null, signal: string | null) => void,
  options?: OnExitOptions | undefined,
): () => void {
  // !globalProcess never fires in Node tests.
  /* c8 ignore start */
  if (!globalProcess) {
    return function remove() {}
  }
  /* c8 ignore stop */
  if (typeof cb !== 'function') {
    throw new TypeErrorCtor('a callback must be provided for exit handler')
  }
  if (isLoaded() === false) {
    load()
  }
  const { alwaysLast } = { __proto__: null, ...options } as OnExitOptions

  let eventName = 'exit'
  if (alwaysLast) {
    eventName = 'afterexit'
  }

  const emitter = getEmitter()
  emitter.on(eventName, cb)

  return function remove() {
    emitter.removeListener(eventName, cb)
    // afterexit listener cleanup; tested via the alwaysLast path.
    /* c8 ignore start */
    if (
      !emitter.listeners('exit').length &&
      !emitter.listeners('afterexit').length
    ) {
      unload()
    }
    /* c8 ignore stop */
  }
}
