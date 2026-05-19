/**
 * @file Shared types for cdxgen resolution. cdxgen is CycloneDX's SBOM
 *   generator, distributed as an npm package (`@cyclonedx/cdxgen`). socket-cli
 *   bundles it for the `socket scan sbom` codepath. Currently the fleet pins
 *   v12.0.0 (matches `socket-cli/packages/cli/bundle-tools.json`); the future
 *   migration target is socket's `sdxgen` fork, gated on its first GA.
 */

export type CdxgenSource = 'download' | 'path' | 'vfs'

/**
 * A resolved cdxgen installation.
 */
export interface ResolvedCdxgen {
  /**
   * Absolute path to the `cdxgen` executable (the npm package's bin shim).
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: CdxgenSource
}
