/**
 * @fileoverview Type definitions for Socket Registry.
 */

// Type definitions
const Categories = {
  CLEANUP: 'cleanup',
  LEVELUP: 'levelup',
  SPEEDUP: 'speedup',
  TUNEUP: 'tuneup',
} as const

export type CategoryString = (typeof Categories)[keyof typeof Categories]

const Interop = {
  BROWSERIFY: 'browserify',
  CJS: 'cjs',
  ESM: 'esm',
} as const

export type InteropString = (typeof Interop)[keyof typeof Interop]

// Based on SocketPURL_Type from socket-sdk-js
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

export type PURLString = (typeof PURL_Type)[keyof typeof PURL_Type]

// Alias for backward compatibility and semantic clarity
export type EcosystemString = PURLString

// Manifest types for Socket Registry
export type ManifestEntryData = {
  categories?: CategoryString[] | undefined
  interop?: InteropString | undefined
  license?: string | undefined
  name: string
  version: string
  [key: string]: unknown
}

export type ManifestEntry = [packageName: string, data: ManifestEntryData]

export type Manifest = Record<EcosystemString, ManifestEntry[]>
