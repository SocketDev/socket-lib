/**
 * @fileoverview Public type surface for `types/*` modules — Socket
 * Registry category / interop / PURL string unions and manifest entry
 * shapes. Pure types, no runtime side effects.
 */

export type CategoryString = 'cleanup' | 'levelup' | 'speedup' | 'tuneup'

export type InteropString = 'browserify' | 'cjs' | 'esm'

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
