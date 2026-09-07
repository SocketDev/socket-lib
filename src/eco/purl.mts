/**
 * @file PURL (Package URL) ecosystem identifiers shared across every package
 *   manager Socket understands.
 *
 *   - `PURL_TYPE` — runtime const mapping camelCase keys to lowercase ecosystem
 *     slugs (e.g. `PURL_TYPE.npm === 'npm'`)
 *   - `PURLString` — string-union of every PURL ecosystem slug
 *   - `EcosystemString` — semantic alias of `PURLString` for places where
 *     "ecosystem" reads more naturally than "PURL string" Based on
 *     SocketPURL_TYPE from socket-sdk-js.
 */

export const PURL_TYPE = {
  alpm: 'alpm',
  apk: 'apk',
  bitbucket: 'bitbucket',
  cargo: 'cargo',
  chrome: 'chrome',
  cocoapods: 'cocoapods',
  composer: 'composer',
  conan: 'conan',
  conda: 'conda',
  cran: 'cran',
  deb: 'deb',
  docker: 'docker',
  gem: 'gem',
  generic: 'generic',
  github: 'github',
  golang: 'golang',
  hackage: 'hackage',
  hex: 'hex',
  huggingface: 'huggingface',
  maven: 'maven',
  mlflow: 'mlflow',
  npm: 'npm',
  nuget: 'nuget',
  oci: 'oci',
  pub: 'pub',
  pypi: 'pypi',
  qpkg: 'qpkg',
  rpm: 'rpm',
  swid: 'swid',
  swift: 'swift',
  vcs: 'vcs',
  vscode: 'vscode',
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
