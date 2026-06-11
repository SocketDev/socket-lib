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
export function getSynpPackageSpec(opts: SynpPackageOptions): string {
  opts = { __proto__: null, ...opts } as typeof opts
  return `synp@${opts.version}`
}
