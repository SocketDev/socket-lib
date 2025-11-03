/**
 * Package manifest interface (subset of package.json)
 */
export interface PackageManifest {
  name: string
  bin?: string | Record<string, string>
  _id?: string
}

/**
 * Get the binary name to execute from a package manifest.
 * Uses npm's bin resolution strategy:
 * 1. If all bin values are identical (aliases), use first key
 * 2. Try unscoped package name (e.g., 'cli' from '@scope/cli')
 * 3. Throw error if cannot determine
 *
 * @param manifest - Package manifest object
 * @returns Binary name to execute
 * @throws Error if binary cannot be determined
 *
 * @example
 * ```typescript
 * const manifest = { name: '@scope/pkg', bin: { 'pkg': './bin/cli.js' } }
 * getBinFromManifest(manifest) // Returns 'pkg'
 * ```
 */
export function getBinFromManifest(manifest: PackageManifest): string

declare const libnpmexec: {
  getBinFromManifest: typeof getBinFromManifest
}

export = libnpmexec
