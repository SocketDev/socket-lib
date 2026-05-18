/**
 * @file PURL (Package URL) ecosystem identifiers shared across every package
 *   manager Socket understands.
 *
 *   - `PURL_Type` — runtime const mapping uppercase keys to lowercase ecosystem
 *     slugs (e.g. `PURL_Type.NPM === 'npm'`)
 *   - `PURLString` — string-union of every PURL ecosystem slug
 *   - `EcosystemString` — semantic alias of `PURLString` for places where
 *     "ecosystem" reads more naturally than "PURL string" Based on
 *     SocketPURL_Type from socket-sdk-js.
 */

export const PURL_Type = {
  ALPM: 'alpm',
  APK: 'apk',
  BITBUCKET: 'bitbucket',
  COCOAPODS: 'cocoapods',
  CARGO: 'cargo',
  CHROME: 'chrome',
  COMPOSER: 'composer',
  CONAN: 'conan',
  CONDA: 'conda',
  CRAN: 'cran',
  DEB: 'deb',
  DOCKER: 'docker',
  GEM: 'gem',
  GENERIC: 'generic',
  GITHUB: 'github',
  GOLANG: 'golang',
  HACKAGE: 'hackage',
  HEX: 'hex',
  HUGGINGFACE: 'huggingface',
  MAVEN: 'maven',
  MLFLOW: 'mlflow',
  NPM: 'npm',
  NUGET: 'nuget',
  OCI: 'oci',
  PUB: 'pub',
  PYPI: 'pypi',
  QPKG: 'qpkg',
  RPM: 'rpm',
  SWID: 'swid',
  SWIFT: 'swift',
  VCS: 'vcs',
  VSCODE: 'vscode',
} as const

export type PURLString =
  | 'alpm'
  | 'apk'
  | 'bitbucket'
  | 'cocoapods'
  | 'cargo'
  | 'chrome'
  | 'composer'
  | 'conan'
  | 'conda'
  | 'cran'
  | 'deb'
  | 'docker'
  | 'gem'
  | 'generic'
  | 'github'
  | 'golang'
  | 'hackage'
  | 'hex'
  | 'huggingface'
  | 'maven'
  | 'mlflow'
  | 'npm'
  | 'nuget'
  | 'oci'
  | 'pub'
  | 'pypi'
  | 'qpkg'
  | 'rpm'
  | 'swid'
  | 'swift'
  | 'vcs'
  | 'vscode'

/**
 * Semantic alias of `PURLString` — same string union, used where "ecosystem"
 * reads more naturally than "PURL".
 */
export type EcosystemString = PURLString
