import type { default as hasFlag } from 'has-flag'
import type { default as signalExit } from 'signal-exit'
import type { default as supportsColor } from 'supports-color'

export interface ExternalPack {
  hasFlag: typeof hasFlag
  signalExit: typeof signalExit
  supportsColor: typeof supportsColor
}

declare const externalPack: ExternalPack
export default externalPack

/*
 * The same members as NAMED exports.
 *
 * external-pack.js is CJS (`module.exports = { hasFlag, ..., supportsColor }`),
 * so these names exist at runtime and `import { supportsColor }` resolves. The
 * declaration file described only the default, so the three per-dep shims that
 * do `export { X as default } from './external-pack'` referenced members TS
 * could not see, and `tsc` failed the declarations build with TS2614 -- which
 * broke the whole build, not just those files.
 *
 * Typed off ExternalPack rather than re-imported from the upstream packages, so
 * a member's type is stated once and these cannot drift from the interface.
 */
export declare const hasFlag: ExternalPack['hasFlag']
export declare const signalExit: ExternalPack['signalExit']
export declare const supportsColor: ExternalPack['supportsColor']
