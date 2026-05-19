/**
 * @file Shared types for synp resolution. synp is a lockfile converter between
 *   yarn.lock and package-lock.json, distributed as an npm package. socket-cli
 *   bundles it for cross-package-manager lockfile interop.
 */

export type SynpSource = 'download' | 'path' | 'vfs'

/**
 * A resolved synp installation.
 */
export interface ResolvedSynp {
  /**
   * Absolute path to the `synp` executable (the npm package's bin shim).
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: SynpSource
}
