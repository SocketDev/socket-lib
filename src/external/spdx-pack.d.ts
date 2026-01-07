import type spdxCorrect from 'spdx-correct'
import type spdxExpressionParse from 'spdx-expression-parse'

export interface SpdxPack {
  spdxCorrect: typeof spdxCorrect
  spdxExpressionParse: typeof spdxExpressionParse
}

declare const spdxPack: SpdxPack
export default spdxPack
