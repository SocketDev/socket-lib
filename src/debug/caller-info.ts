/**
 * @file `getCallerInfo` — extract the caller's function name from the V8 stack
 *   trace at a given offset. Used by every output function to prefix the debug
 *   line with the calling site. Strips V8-injected prefixes (`async`, `bound`,
 *   `Object.`, etc.) so the printed name matches what the developer typed.
 */

import { hasOwn } from '../objects/predicates'
import {
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../primordials/string'

/**
 * Extract caller information from the stack trace.
 *
 * @private
 */
export function getCallerInfo(stackOffset: number = 3): string {
  let name = ''
  const captureStackTrace = Error.captureStackTrace
  // V8 always exposes captureStackTrace; non-function branch fires only
  // on exotic embedders that strip Error.captureStackTrace.
  /* c8 ignore start */
  if (typeof captureStackTrace === 'function') {
    const obj: { stack?: unknown | undefined } = {}
    captureStackTrace(obj, getCallerInfo)
    const stack = obj.stack
    // obj.stack is always a string after captureStackTrace.
    if (typeof stack === 'string') {
      let lineCount = 0
      let lineStart = 0
      for (let i = 0, { length } = stack; i < length; i += 1) {
        if (stack[i] === '\n') {
          lineCount += 1
          if (lineCount < stackOffset) {
            // Store the start index of the next line.
            lineStart = i + 1
          } else {
            // Extract the full line and trim it.
            const line = stack.slice(lineStart, i).trimStart()
            // Match the function name portion (e.g., "async runFix").
            const match = /(?<=^at\s+).*?(?=\s+\(|$)/.exec(line)?.[0]
            /* c8 ignore next - Defensive guard; real V8 stack frames
               always start with 'at '. */
            if (match) {
              name = match
                // Strip known V8 invocation prefixes to get the name.
                .replace(/^(?:async|bound|get|new|set)\s+/, '')
              // V8-specific 'Object.' stack frame prefix; only fires
              // for stack frames in object literal method calls.
              if (StringPrototypeStartsWith(name, 'Object.')) {
                // Strip leading 'Object.' if not an own property of Object.
                const afterDot = StringPrototypeSlice(name, 7)
                if (!hasOwn(Object, afterDot)) {
                  name = afterDot
                }
              }
            }
            break
          }
        }
      }
    }
  }
  /* c8 ignore stop */
  return name
}
