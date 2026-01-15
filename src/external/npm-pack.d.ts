import type * as pacote from 'pacote'
import type libnpmpack from 'libnpmpack'
import type * as cacache from 'cacache'
import type makeFetchHappen from 'make-fetch-happen'
import type Arborist from '@npmcli/arborist'
import type normalizePackageData from 'normalize-package-data'
import type npmPackageArg from 'npm-package-arg'
import type * as semver from 'semver'
import type validateNpmPackageName from 'validate-npm-package-name'

export interface NpmPack {
  Arborist: typeof Arborist
  pacote: Pick<typeof pacote, 'extract'>
  libnpmpack: typeof libnpmpack
  cacache: Pick<typeof cacache, 'get' | 'put' | 'rm' | 'ls' | 'tmp'>
  makeFetchHappen: Pick<typeof makeFetchHappen, 'defaults'>
  normalizePackageData: typeof normalizePackageData
  npmPackageArg: typeof npmPackageArg
  semver: typeof semver
  validateNpmPackageName: typeof validateNpmPackageName
}

declare const npmPack: NpmPack
export default npmPack
