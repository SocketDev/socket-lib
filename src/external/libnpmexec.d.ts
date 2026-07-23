/**
 * Package manifest interface (subset of package.json)
 */
export interface PackageManifest {
  name: string
  bin?: string | Record<string, string> | undefined
  _id?: string | undefined
}

/**
 * Get the binary name to execute from a package manifest. Uses npm's bin
 * resolution strategy: 1. If all bin values are identical (aliases), use first
 * key 2. Try unscoped package name (e.g., 'cli' from '@scope/cli') 3. Throw
 * error if cannot determine.
 *
 * @example
 *   ;```typescript
 *   const manifest = { name: '@scope/pkg', bin: { pkg: './bin/cli.js' } }
 *   getBinFromManifest(manifest) // Returns 'pkg'
 *   ```
 *
 * @param manifest - Package manifest object.
 *
 * @returns Binary name to execute
 *
 * @throws Error if binary cannot be determined
 */
export function getBinFromManifest(manifest: PackageManifest): string

export interface LibnpmexecDefault {
  getBinFromManifest: typeof getBinFromManifest
}

declare const libnpmexec: LibnpmexecDefault
// oxlint-disable-next-line socket/no-default-export -- ambient shim for a CJS lib whose real export IS the default; a named re-shape would misdescribe the module.
export default libnpmexec
