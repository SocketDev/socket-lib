/**
 * @file Upstream cdxgen release asset-name mapping per `platform-arch`. cdxgen
 *   ships per-platform SEA binaries starting in v12.0.x — bare executables, no
 *   archive wrapper, with companion `.sha256` sidecars. Each platform has both
 *   a "full" variant (bundles bun + deno runtimes for those project types) and
 *   a "slim" variant (no bundled runtimes; relies on the host having them when
 *   needed). We ship the slim variants by default: socket-lib consumers run
 *   cdxgen for npm/pip/maven/etc. SBOM generation where the bundled runtimes
 *   aren't on the hot path, and the slim binary is ~3× smaller. Consumers that
 *   need full (bun/deno project scanning) can override by passing `variant:
 *   'full'`. Asset URLs:
 *   https://github.com/CycloneDX/cdxgen/releases/download/v<X.Y.Z>/cdxgen-<os>-<arch>[-musl][-slim][.exe]
 *   Reference: https://github.com/CycloneDX/cdxgen/releases. Single source of
 *   truth: the SEA binary IS the install path. The legacy `@cyclonedx/cdxgen`
 *   npm package is not used as a fallback — every platform-arch Socket supports
 *   has a SEA build, and routing through npm for unsupported targets would
 *   silently use a different distribution (different bundle composition,
 *   different startup cost, different version-pin surface). One install path;
 *   one cached binary.
 */

import { ObjectFreeze } from '../../primordials/object'

export interface CdxgenAssetEntry {
  /**
   * Full asset filename. Version-free — the release tag is the version.
   */
  readonly asset: string
}

/**
 * Pull `variant: 'slim'` (default — no bundled runtimes) or `'full'` (bundles
 * bun + deno runtimes; ~3× larger).
 */
export type CdxgenVariant = 'full' | 'slim'

export interface CdxgenDownloadOptions {
  /**
   * Cdxgen release version, e.g. `'12.4.1'`. Bare semver; the helper prepends
   * `v` for the release tag.
   */
  version: string
  /**
   * Socket platform-arch token — looked up in the asset map. Returns
   * `undefined` when no entry exists for the target.
   */
  platformArch: string
  /**
   * Slim (no bundled bun/deno) or full (bundles both). Defaults to slim.
   */
  variant?: CdxgenVariant | undefined
}

export function buildCdxgenAssetName(
  baseTriple: string,
  variant: CdxgenVariant,
  ext: '' | '.exe',
): string {
  const slim = variant === 'slim' ? '-slim' : ''
  return `cdxgen-${baseTriple}${slim}${ext}`
}

export function getCdxgenAssetEntry(
  platformArch: string,
  variant: CdxgenVariant = 'slim',
): CdxgenAssetEntry | undefined {
  const map = variant === 'full' ? CDXGEN_FULL_ASSET_MAP : CDXGEN_SLIM_ASSET_MAP
  return map[platformArch]
}

/**
 * Build the GitHub release-asset download URL for an upstream cdxgen binary.
 * Returns `undefined` when no entry exists for the requested platform-arch.
 */
export function getCdxgenDownloadUrl(
  options: CdxgenDownloadOptions,
): string | undefined {
  const {
    platformArch,
    variant = 'slim',
    version,
  } = { __proto__: null, ...options } as typeof options
  const entry = getCdxgenAssetEntry(platformArch, variant)
  if (!entry) {
    return undefined
  }
  return (
    `https://github.com/CycloneDX/cdxgen/releases/download/v${version}/` +
    entry.asset
  )
}

export function makeCdxgenEntry(
  baseTriple: string,
  variant: CdxgenVariant,
  ext: '' | '.exe' = '',
): CdxgenAssetEntry {
  return ObjectFreeze({
    __proto__: null,
    asset: buildCdxgenAssetName(baseTriple, variant, ext),
  }) as unknown as CdxgenAssetEntry
}

export function makeCdxgenPlatformMap(
  variant: CdxgenVariant,
): Readonly<Record<string, CdxgenAssetEntry>> {
  return ObjectFreeze({
    __proto__: null,
    'darwin-arm64': makeCdxgenEntry('darwin-arm64', variant),
    'darwin-x64': makeCdxgenEntry('darwin-amd64', variant),
    'linux-arm64': makeCdxgenEntry('linux-arm64', variant),
    'linux-arm64-musl': makeCdxgenEntry('linux-arm64-musl', variant),
    'linux-x64': makeCdxgenEntry('linux-amd64', variant),
    'linux-x64-musl': makeCdxgenEntry('linux-amd64-musl', variant),
    'win-arm64': makeCdxgenEntry('windows-arm64', variant, '.exe'),
    'win-x64': makeCdxgenEntry('windows-amd64', variant, '.exe'),
  }) as unknown as Readonly<Record<string, CdxgenAssetEntry>>
}

export const CDXGEN_SLIM_ASSET_MAP = makeCdxgenPlatformMap('slim')
export const CDXGEN_FULL_ASSET_MAP = makeCdxgenPlatformMap('full')
