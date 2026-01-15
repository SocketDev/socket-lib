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
