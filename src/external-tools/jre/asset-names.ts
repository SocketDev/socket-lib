/**
 * @fileoverview Adoptium API platform-arch → asset-query mappings.
 *
 * Adoptium's REST endpoint (`api.adoptium.net/v3/assets/...`) filters
 * available JRE/JDK binaries by:
 *   - `os`: 'mac' | 'linux' | 'alpine-linux' | 'windows'
 *   - `architecture`: 'x64' | 'aarch64' | 'arm' | 'x86'
 *   - `image_type`: 'jre' | 'jdk'
 *
 * We carry the full mapping so socket-cli can request the right
 * binary for the user's machine without hardcoding query strings at
 * every callsite.
 *
 * Adoptium does not ship Windows ARM64 builds for all LTS versions;
 * Java 21 is the first major release with full coverage. Callers
 * targeting older majors should fall back to bundling or detect
 * unavailability and surface a clear error.
 */

import { ObjectFreeze } from '../../primordials/object'

export type AdoptiumOs = 'mac' | 'linux' | 'alpine-linux' | 'windows'

export type AdoptiumArch = 'x64' | 'aarch64' | 'arm' | 'x86'

export interface AdoptiumAssetQuery {
  readonly os: AdoptiumOs
  readonly architecture: AdoptiumArch
}

/**
 * platform-arch string (matches `getPlatformArch` output) →
 * `{ os, architecture }` query for Adoptium.
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
 * Returns the Adoptium query parameters for a given platform-arch,
 * or `undefined` if no Adoptium build exists for that target.
 */
export function getAdoptiumQuery(
  platformArch: string,
): AdoptiumAssetQuery | undefined {
  return ADOPTIUM_QUERY_MAP[platformArch]
}
