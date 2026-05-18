/**
 * @file Bump the max-listener cap on an EventTarget (or AbortSignal). Lives
 *   next to the suppress-warnings family because the goal is the same — silence
 *   Node's noise about exceeding the default 10-listener threshold — but the
 *   mechanism is different: here we set the symbol on the target itself, no
 *   `process.emitWarning` wrapping involved.
 */

import { ObjectGetOwnPropertySymbols } from '../primordials/object'

/**
 * Set max listeners on an EventTarget (like AbortSignal) to avoid TypeError.
 *
 * By manually setting `kMaxEventTargetListeners` on the target we avoid:
 * TypeError [ERR_INVALID_ARG_TYPE]: The "emitter" argument must be an instance
 * of EventEmitter or EventTarget. Received an instance of AbortSignal.
 *
 * In some patch releases of Node 18-23 when calling events.getMaxListeners().
 * See https://github.com/nodejs/node/pull/56807.
 *
 * Instead of calling events.setMaxListeners(n, target) we set the symbol
 * property directly to avoid depending on 'node:events' module.
 *
 * @example
 *   import { setMaxEventTargetListeners } from '@socketsecurity/lib/warnings/event-target'
 *
 *   const controller = new AbortController()
 *   setMaxEventTargetListeners(controller.signal)
 *
 * @param target - The EventTarget or AbortSignal to configure.
 * @param maxListeners - Maximum number of listeners (defaults to 10, the
 *   Node.js default)
 */
export function setMaxEventTargetListeners(
  target: EventTarget | AbortSignal | undefined,
  maxListeners: number = 10,
): void {
  // !target arm fires for caller-passes-undefined; symbol-not-found
  // arm fires only on Node runtimes that don't expose the symbol.
  /* c8 ignore start */
  if (!target) {
    return
  }
  const symbols = ObjectGetOwnPropertySymbols(target)
  const kMaxEventTargetListeners = symbols.find(
    s => s.description === 'events.maxEventTargetListeners',
  )
  if (kMaxEventTargetListeners) {
    // The default events.defaultMaxListeners value is 10.
    // https://nodejs.org/api/events.html#eventsdefaultmaxlisteners
    ;(target as unknown as Record<symbol, number>)[kMaxEventTargetListeners] =
      maxListeners
  }
  /* c8 ignore stop */
}
