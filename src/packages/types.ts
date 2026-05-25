/**
 * @file Public type surface for `packages/*` modules — the `PackageJson` shape
 *   (npm-extended with a `socket` field) plus option bags consumed across
 *   `edit` / `manifest` / `normalize` / `operations` / `provenance` /
 *   `licenses`. Pure types, no runtime side effects.
 */

import type { CategoryString } from '../eco/types'

// Type for package.json exports field.
type PackageExports = {
  [path: string]: unknown
}

// Re-export the EditablePackageJson instance type for convenient access
export type EditablePackageJson = import('./edit').EditablePackageJsonInstance

/**
 * Extended PackageJson type based on NPMCliPackageJson.Content with
 * Socket-specific additions.
 *
 * @extends NPMCliPackageJson.Content (from @npmcli/package-json)
 *
 * @property socket - Optional Socket.dev specific configuration.
 */
export type PackageJson = {
  // Core npm fields
  [key: string]: unknown
  name?: string | undefined
  version?: string | undefined
  description?: string | undefined
  main?: string | undefined
  module?: string | undefined
  types?: string | undefined
  typings?: string | undefined
  bin?: string | Record<string, string> | undefined

  // Author and contributors
  author?: string | { name?: string; email?: string; url?: string } | undefined
  contributors?:
    | Array<string | { name?: string; email?: string; url?: string }>
    | undefined
  maintainers?:
    | Array<string | { name?: string; email?: string; url?: string }>
    | undefined

  // Repository and URLs
  repository?:
    | string
    | { type?: string; url?: string; directory?: string }
    | undefined
  homepage?: string | undefined
  bugs?: string | { url?: string; email?: string } | undefined

  // License
  license?: string | undefined
  licenses?: Array<{ type?: string; url?: string }> | undefined

  // Scripts
  scripts?: Record<string, string> | undefined

  // Dependencies
  dependencies?: Record<string, string> | undefined
  devDependencies?: Record<string, string> | undefined
  peerDependencies?: Record<string, string> | undefined
  optionalDependencies?: Record<string, string> | undefined
  bundledDependencies?: string[] | undefined
  bundleDependencies?: string[] | undefined

  // Package managers specific
  overrides?: Record<string, string> | undefined
  resolutions?: Record<string, string> | undefined
  pnpm?: Record<string, unknown> | undefined

  // Module system
  exports?: PackageExports | string | string[] | undefined
  imports?: Record<string, unknown> | undefined
  type?: 'module' | 'commonjs' | undefined

  // Publishing
  private?: boolean | undefined
  publishConfig?: Record<string, unknown> | undefined
  files?: string[] | undefined
  keywords?: string[] | undefined
  sideEffects?: boolean | string[] | undefined

  // Engines and OS
  engines?: Record<string, string> | undefined
  os?: string[] | undefined
  cpu?: string[] | undefined

  // Package manager
  packageManager?: string | undefined

  // Workspaces
  workspaces?: string[] | { packages?: string[] } | undefined

  // Socket.dev specific
  socket?:
    | {
        categories?: CategoryString | CategoryString[]
        interop?: string | string[]
        [key: string]: unknown
      }
    | undefined
}

export type SaveOptions = {
  ignoreWhitespace?: boolean | undefined
  sort?: boolean | undefined
}

export type EditablePackageJsonOptions = {
  normalize?: boolean | undefined
  path?: string | undefined
  preserve?: string[] | readonly string[] | undefined
  create?: boolean | undefined
  data?: PackageJson | undefined
}

export type ExtractOptions = {
  dest?: string | undefined
  tmpPrefix?: string | undefined
  signal?: AbortSignal | undefined
  packumentCache?: Map<string, unknown> | undefined
  preferOffline?: boolean | undefined
}

export type NormalizeOptions = {
  preserve?: string[] | readonly string[] | undefined
}

export type ReadPackageJsonOptions = NormalizeOptions & {
  editable?: boolean | undefined
  normalize?: boolean | undefined
  throws?: boolean | undefined
}

export type ProvenanceOptions = {
  signal?: AbortSignal | undefined
  timeout?: number | undefined
}

export type LicenseNode = {
  license: string
  exception?: string | undefined
  inFile?: string | undefined
  plus?: boolean | undefined
}

export type PacoteOptions = {
  signal?: AbortSignal | undefined
  packumentCache?: Map<string, unknown> | undefined
  preferOffline?: boolean | undefined
  fullMetadata?: boolean | undefined
}
