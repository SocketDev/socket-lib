import type { PicoPack } from './pico-pack'

export type FastGlob = PicoPack['glob']

declare const fastGlob: FastGlob
export default fastGlob

export const { glob, globStream, globSync } = fastGlob
