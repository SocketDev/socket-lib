import type npmPackageArg from 'npm-package-arg'
import type normalizePackageData from 'normalize-package-data'
import type * as semver from 'semver'

export interface NpmCore {
  npmPackageArg: typeof npmPackageArg
  normalizePackageData: typeof normalizePackageData
  semver: typeof semver
}

declare const npmCore: NpmCore
export = npmCore
