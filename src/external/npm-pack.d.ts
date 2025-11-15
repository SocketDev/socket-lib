import type * as pacote from 'pacote'
import type libnpmpack from 'libnpmpack'
import type * as cacache from 'cacache'
import type makeFetchHappen from 'make-fetch-happen'
import type Arborist from '@npmcli/arborist'

export interface NpmPack {
  Arborist: typeof Arborist
  pacote: Pick<typeof pacote, 'extract'>
  libnpmpack: typeof libnpmpack
  cacache: Pick<typeof cacache, 'get' | 'put' | 'rm' | 'ls' | 'tmp'>
  makeFetchHappen: Pick<typeof makeFetchHappen, 'defaults'>
}

declare const npmPack: NpmPack
export default npmPack
