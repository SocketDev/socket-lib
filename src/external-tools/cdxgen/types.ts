/**
 * @file Shared types for cdxgen resolution. cdxgen is CycloneDX's SBOM
 *   generator. As of v12.0.x it ships per-platform SEA binaries (the preferred
 *   install path); the legacy npm package distribution remains available as a
 *   fallback. The future migration target is socket's `sdxgen` fork once that
 *   lands GA — the helper API stays `resolveCdxgen()` for backward
 *   compatibility either way.
 */

export type CdxgenSource = 'download' | 'npm' | 'path' | 'vfs'

/**
 * A resolved cdxgen installation.
 */
export interface ResolvedCdxgen {
  /**
   * Absolute path to the `cdxgen` executable.
   *
   * - `source === 'download'`: the SEA binary copied into the dlx cache.
   * - `source === 'npm'`: the npm package's bin shim.
   * - `source === 'path'`: whatever `which cdxgen` returned.
   * - `source === 'vfs'`: the smol binary's extracted bundle.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: CdxgenSource
}
