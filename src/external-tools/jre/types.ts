/**
 * @file Shared types for JRE resolution. Returned by `resolveJre()` to describe
 *   a discovered JRE:
 *
 *   - `javaPath` — absolute path to the `java` executable
 *   - `javaHome` — absolute path to the JRE root (parent of `bin/`)
 *   - `source` — which resolver tier found this JRE Major-version detection is
 *     intentionally left out of the resolved shape; callers that need it spawn
 *     `java -version` lazily. Most external-tools callsites (Bazel, SBT) don't
 *     need it — they assume the JRE is compatible with their launcher.
 */

import type { AdoptiumAssetQuery } from './asset-names'

export type JreSource = 'download' | 'java-home' | 'path' | 'vfs'

/**
 * A resolved JRE installation. Either embedded in the smol binary's VFS,
 * pointed to by `JAVA_HOME`, or present on PATH.
 */
export interface ResolvedJre {
  readonly javaPath: string
  readonly javaHome: string
  readonly source: JreSource
  /**
   * SRI integrity (`sha512-<base64>`) of the downloaded archive. Set ONLY when
   * `source === 'download'` — the local-discovery tiers (vfs / java-home /
   * path) point at bytes already on disk and don't compute a fresh hash. Use
   * this for trust-on-first-use: write back to `external-tools.json` after the
   * first download so subsequent calls verify against the pin.
   */
  readonly integrity?: string | undefined
}

export type { AdoptiumAssetQuery }
