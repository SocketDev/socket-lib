import type npmPackageArg from 'npm-package-arg'
import type normalizePackageData from 'normalize-package-data'
import type * as semver from 'semver'
import type validateNpmPackageName from 'validate-npm-package-name'

export interface NpmCore {
  npmPackageArg: typeof npmPackageArg
  normalizePackageData: typeof normalizePackageData
  semver: typeof semver
  validateNpmPackageName: typeof validateNpmPackageName
}

declare const npmCore: NpmCore
export default npmCore
