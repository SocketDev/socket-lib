/**
 * @file Upstream synp package coordinates. npm package only — no per-platform
 *   binaries — so the asset surface is just the package spec.
 */

export interface SynpPackageOptions {
  /**
   * Synp release version, e.g. `'1.9.14'`.
   */
  version: string
}

/**
 * Build the npm package spec string for the requested synp version.
 */
export function getSynpPackageSpec(options: SynpPackageOptions): string {
  options = { __proto__: null, ...options } as typeof options
  return `synp@${options.version}`
}
