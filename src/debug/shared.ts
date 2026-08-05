/**
 * @file Private internals for `debug/*` modules — the lazy debug-js accessor,
 *   the `debugByNamespace` cache that `namespace.getDebugJsInstance` fills,
 *   the lazy `pointingTriangle` glyph used by every output function, and
 *   `customLog` (the `debug-js` log-writer override). Node-bound pieces are
 *   deferred to first use — the vendored debug-js bundle is required lazily
 *   (its module top-level reads env / requires tty), the default `Logger` is
 *   constructed per call via the already-lazy `getDefaultLogger`, and
 *   `node:util` loads through the `getNodeUtil` accessor. Every call site
 *   sits behind the SOCKET_DEBUG / DEBUG env gates, so importing a `debug/*`
 *   leaf stays browser-load-safe and V8-snapshot-safe. Co-located so the
 *   namespace / output / caller-info leaves don't fragment ownership of this
 *   shared module state.
 */

import isUnicodeSupported from '../external/@socketregistry/is-unicode-supported'
import { getDefaultLogger } from '../logger/default'
import { MapCtor } from '../primordials/map-set'
import { ReflectApply } from '../primordials/reflect'

import { getNodeUtil } from '../node/util'

import type debugJs from '../external/debug'

export const debugByNamespace = new MapCtor()

// Re-export canonical node:util loader under the debug/ legacy name.
// New code should import getNodeUtil from '@socketsecurity/lib/node/util'.
export { getNodeUtil as getUtil } from '../node/util'

let cachedDebugJs: typeof debugJs | undefined

let pointingTriangle: string | undefined

/**
 * Custom log function for debug output.
 *
 * @private
 */
/* c8 ignore start - customLog is assigned to debugJs instances and
   only fires when debugJs emits, which requires DEBUG=* env var
   set at the right module-load timing. Tests use the SOCKET_DEBUG
   path which writes via logger.info directly. */
export function customLog(...args: unknown[]) {
  const util = getNodeUtil()
  const debugJsInstance = getDebugJs()
  const inspectOpts = debugJsInstance.inspectOpts
    ? {
        ...debugJsInstance.inspectOpts,
        showHidden:
          debugJsInstance.inspectOpts.showHidden === null
            ? undefined
            : debugJsInstance.inspectOpts.showHidden,
        depth:
          debugJsInstance.inspectOpts.depth === null ||
          typeof debugJsInstance.inspectOpts.depth === 'boolean'
            ? undefined
            : debugJsInstance.inspectOpts.depth,
      }
    : {}
  const logger = getDefaultLogger()
  ReflectApply(logger.info, logger, [
    util.formatWithOptions(inspectOpts, ...args),
  ])
}
/* c8 ignore stop */

/**
 * Lazily require the vendored `debug-js` bundle. Deferred to first use so
 * importing a `debug/*` leaf never evaluates debug-js's node-bound module
 * top-level (tty/util requires, process.env reads); every caller sits behind
 * the env gates, so browser bundles load this leaf without executing it.
 *
 * @private
 */
export function getDebugJs(): typeof debugJs {
  if (cachedDebugJs === undefined) {
    cachedDebugJs = require('../external/debug') as typeof debugJs
  }
  return cachedDebugJs
}

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
export function getPointingTriangle(): string {
  if (pointingTriangle === undefined) {
    const supported = isUnicodeSupported()
    pointingTriangle = supported ? '▸' : '>'
  }
  return pointingTriangle
}
/* c8 ignore stop */
