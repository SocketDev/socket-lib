import type * as delTypes from 'del'
import type * as fastGlobTypes from 'fast-glob'
import type picomatchType from 'picomatch'

export interface PicoPack {
  del: Pick<typeof delTypes, 'deleteAsync' | 'deleteSync'>
  glob: {
    glob: typeof fastGlobTypes
    globStream: typeof fastGlobTypes.globStream
    globSync: typeof fastGlobTypes.sync
  }
  picomatch: typeof picomatchType
}

declare const picoPack: PicoPack
export default picoPack
