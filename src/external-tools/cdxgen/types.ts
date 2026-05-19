/**
 * @file Shared types for cdxgen resolution. cdxgen ships per-platform SEA
 *   binaries starting in v12.0.x — that's the single install path. The legacy
 *   `@cyclonedx/cdxgen` npm package is NOT used as a fallback: every fleet
 *   platform-arch has a SEA build, and routing through npm for any target would
 *   silently use a different distribution (different bundle composition,
 *   different startup cost). One install path; one cached binary. The future
 *   migration target is socket's `sdxgen` fork once that lands GA — the helper
 *   API stays `resolveCdxgen()` for backward compatibility either way.
 */

export type CdxgenSource = 'download' | 'path' | 'vfs'

/**
 * A resolved cdxgen installation.
 */
export interface ResolvedCdxgen {
  /**
   * Absolute path to the `cdxgen` executable.
   *
   * - `source === 'download'`: the SEA binary copied into the dlx cache.
   * - `source === 'path'`: whatever `which cdxgen` returned.
   * - `source === 'vfs'`: the smol binary's extracted bundle.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: CdxgenSource
  /**
   * SRI integrity (`sha512-<base64>`) of the downloaded SEA binary. Set ONLY
   * when `source === 'download'`; vfs / path tiers don't compute it. Use for
   * trust-on-first-use pinning.
   */
  readonly integrity?: string | undefined
}
