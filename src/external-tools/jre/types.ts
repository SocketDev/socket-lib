/**
 * @fileoverview Shared types for JRE resolution.
 *
 * Returned by `resolveJre()` to describe a discovered JRE:
 *   - `javaPath` — absolute path to the `java` executable
 *   - `javaHome` — absolute path to the JRE root (parent of `bin/`)
 *   - `source` — which resolver tier found this JRE
 *
 * Major-version detection is intentionally left out of the resolved
 * shape; callers that need it spawn `java -version` lazily. Most
 * external-tools callsites (Bazel, SBT) don't need it — they assume
 * the JRE is compatible with their launcher.
 */

import type { AdoptiumAssetQuery } from './asset-names'

export type JreSource = 'vfs' | 'java-home' | 'path' | 'download'

/**
 * A resolved JRE installation. Either embedded in the smol binary's
 * VFS, pointed to by `JAVA_HOME`, or present on PATH.
 */
export interface ResolvedJre {
  readonly javaPath: string
  readonly javaHome: string
  readonly source: JreSource
}

export type { AdoptiumAssetQuery }
