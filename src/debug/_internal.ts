/**
 * @file Private internals for `debug/*` modules — the cached logger instance,
 *   lazy `node:util` accessor, the `debugByNamespace` cache that
 *   `namespace.getDebugJsInstance` fills, the lazy `pointingTriangle` glyph
 *   used by every output function, and `customLog` (the `debug-js` log-writer
 *   override). Co-located so the namespace / output / caller-info leaves don't
 *   fragment ownership of this shared module state.
 */

import isUnicodeSupported from '../external/@socketregistry/is-unicode-supported'
import debugJs from '../external/debug'
import { getDefaultLogger } from '../logger/logger'
import { MapCtor } from '../primordials/map-set'
import { ReflectApply } from '../primordials/reflect'

export const logger = getDefaultLogger()

export const debugByNamespace = new MapCtor()

import { getNodeUtil } from '../node/util'

// Re-export canonical node:util loader under the debug/ legacy name.
// New code should import getNodeUtil from '@socketsecurity/lib/node/util'.
export { getNodeUtil as getUtil } from '../node/util'

let _pointingTriangle: string | undefined

/**
 * Custom log function for debug output.
 *
 * @private
 */
/* c8 ignore start - customLog is assigned to debugJs instances and
   only fires when debugJs emits, which requires DEBUG=* env var
   set at the right module-load timing. Tests use the SOCKET_DEBUG
   path which writes via logger.info directly. */
/*@__NO_SIDE_EFFECTS__*/
export function customLog(...args: unknown[]) {
  const util = getNodeUtil()
  const inspectOpts = debugJs.inspectOpts
    ? {
        ...debugJs.inspectOpts,
        showHidden:
          debugJs.inspectOpts.showHidden === null
            ? undefined
            : debugJs.inspectOpts.showHidden,
        depth:
          debugJs.inspectOpts.depth === null ||
          typeof debugJs.inspectOpts.depth === 'boolean'
            ? undefined
            : debugJs.inspectOpts.depth,
      }
    : {}
  ReflectApply(logger.info, logger, [
    util.formatWithOptions(inspectOpts, ...args),
  ])
}
/* c8 ignore stop */

/**
 * Lazily resolve the "pointing triangle" glyph — `▸` on terminals with unicode
 * support, `>` everywhere else. Initialised on first call by the output
 * functions.
 *
 * @private
 */
/* c8 ignore start - First-call init for module-level glyph; only
   one of the 5 debug functions hits the body. The unicode-fallback
   arm also fires only on terminals without unicode support. */
/*@__NO_SIDE_EFFECTS__*/
export function getPointingTriangle(): string {
  if (_pointingTriangle === undefined) {
    const supported = isUnicodeSupported()
    _pointingTriangle = supported ? '▸' : '>'
  }
  return _pointingTriangle
}
/* c8 ignore stop */
