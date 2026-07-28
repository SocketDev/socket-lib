/**
 * @file Adoptium API platform-arch → asset-query mappings. Adoptium's REST
 *   endpoint (`api.adoptium.net/v3/assets/...`) filters available JRE/JDK
 *   binaries by:
 *
 *   - `os`: 'mac' | 'linux' | 'alpine-linux' | 'windows'
 *   - `architecture`: 'x64' | 'aarch64' | 'arm' | 'x86'
 *   - `image_type`: 'jre' | 'jdk' We carry the full mapping so socket-cli can
 *     request the right binary for the user's machine without hardcoding query
 *     strings at every callsite. Adoptium does not ship Windows ARM64 builds
 *     for all LTS versions; Java 21 is the first major release with full
 *     coverage. Callers targeting older majors should fall back to bundling or
 *     detect unavailability and surface a clear error.
 */

import { ObjectFreeze } from '../../primordials/object'

export type AdoptiumOs = 'mac' | 'linux' | 'alpine-linux' | 'windows'

export type AdoptiumArch = 'x64' | 'aarch64' | 'arm' | 'x86'

export interface AdoptiumAssetQuery {
  readonly os: AdoptiumOs
  readonly architecture: AdoptiumArch
}

/**
 * Platform-arch string (matches `getPlatformArch` output) → `{ os, architecture
 * }` query for Adoptium.
 */
export const ADOPTIUM_QUERY_MAP: Readonly<Record<string, AdoptiumAssetQuery>> =
  ObjectFreeze({
    __proto__: null,
    'darwin-arm64': ObjectFreeze({
      __proto__: null,
      os: 'mac',
      architecture: 'aarch64',
    }) as unknown as AdoptiumAssetQuery,
    'darwin-x64': ObjectFreeze({
      __proto__: null,
      os: 'mac',
      architecture: 'x64',
    }) as unknown as AdoptiumAssetQuery,
    'linux-arm64': ObjectFreeze({
      __proto__: null,
      os: 'linux',
      architecture: 'aarch64',
    }) as unknown as AdoptiumAssetQuery,
    'linux-arm64-musl': ObjectFreeze({
      __proto__: null,
      os: 'alpine-linux',
      architecture: 'aarch64',
    }) as unknown as AdoptiumAssetQuery,
    'linux-x64': ObjectFreeze({
      __proto__: null,
      os: 'linux',
      architecture: 'x64',
    }) as unknown as AdoptiumAssetQuery,
    'linux-x64-musl': ObjectFreeze({
      __proto__: null,
      os: 'alpine-linux',
      architecture: 'x64',
    }) as unknown as AdoptiumAssetQuery,
    'win-arm64': ObjectFreeze({
      __proto__: null,
      os: 'windows',
      architecture: 'aarch64',
    }) as unknown as AdoptiumAssetQuery,
    'win-x64': ObjectFreeze({
      __proto__: null,
      os: 'windows',
      architecture: 'x64',
    }) as unknown as AdoptiumAssetQuery,
  }) as unknown as Readonly<Record<string, AdoptiumAssetQuery>>

/**
 * Options for {@link getAdoptiumDownloadUrl}.
 */
export interface AdoptiumDownloadOptions {
  /**
   * Java feature version (the major). `21` for Java 21, `17` for 17, etc.
   * Adoptium accepts the bare integer; we pass it through as a string in the
   * URL.
   */
  version: number
  /**
   * Socket platform-arch token — same vocabulary as `getPlatformArch` output.
   * Looked up in `ADOPTIUM_QUERY_MAP`; returns `undefined` when Adoptium
   * doesn't publish a build for that target (e.g. `win-arm64` for older
   * majors).
   */
  platformArch: string
  /**
   * Whether to fetch the JRE or the full JDK.
   *
   * @default 'jre'
   */
  type?: 'jre' | 'jdk' | undefined
  /**
   * Adoptium release channel.
   *
   * @default 'ga'
   */
  releaseType?: 'ga' | 'ea' | undefined
}

/**
 * Build the `latest-binary` download URL on Adoptium's API. Hitting the URL
 * with a normal HTTP GET returns the JRE/JDK archive bytes (`tar.gz` on
 * macOS/Linux, `zip` on Windows). The URL is stable for a given `{version,
 * releaseType}` combination — Adoptium serves the newest patch release behind
 * it.
 *
 * Returns `undefined` when no Adoptium build exists for the requested
 * platform-arch; the caller should surface an installable error rather than
 * blindly fetching a 404.
 *
 * Reference: https://adoptium.net/temurin/releases/?package=jre.
 *
 * @example
 *   ;```typescript
 *   const url = getAdoptiumDownloadUrl({
 *     version: 21,
 *     platformArch: 'darwin-arm64',
 *   })
 *   // → 'https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jre/hotspot/normal/eclipse'
 *
 *   // Hand to downloadAndExtractTool:
 *   await downloadAndExtractTool({
 *     url: url!,
 *     name: 'adoptium-jre-21-darwin-arm64',
 *     extractedDir: cacheDir,
 *     extractOptions: { strip: 1 },
 *   })
 *   ```
 */
export function getAdoptiumDownloadUrl(
  options: AdoptiumDownloadOptions,
): string | undefined {
  const {
    platformArch,
    releaseType = 'ga',
    type = 'jre',
    version,
  } = { __proto__: null, ...options } as typeof options
  const query = ADOPTIUM_QUERY_MAP[platformArch]
  if (!query) {
    return undefined
  }
  return (
    `https://api.adoptium.net/v3/binary/latest/${version}/${releaseType}/` +
    `${query.os}/${query.architecture}/${type}/hotspot/normal/eclipse`
  )
}

/**
 * Returns the Adoptium query parameters for a given platform-arch, or
 * `undefined` if no Adoptium build exists for that target.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function getAdoptiumQuery(
  platformArch: string,
): AdoptiumAssetQuery | undefined {
  return ADOPTIUM_QUERY_MAP[platformArch]
}
