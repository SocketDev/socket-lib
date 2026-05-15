/**
 * @fileoverview Shared types for SBT resolution.
 *
 * SBT (Scala Build Tool) is JVM-based. A "resolved SBT" is a launcher
 * — either the `sbt` shell script on the user's PATH, or the
 * `sbt-launch.jar` extracted from the smol binary's VFS. In the VFS
 * case, the caller is responsible for invoking the launcher with
 * `java -jar <launcherPath>` using the JRE resolved via `resolveJre()`.
 */

export type SbtSource = 'vfs' | 'path' | 'download'

/**
 * A resolved SBT launcher.
 */
export interface ResolvedSbt {
  /**
   * Absolute path to the launcher.
   *
   *   - `source === 'path'`: the user's `sbt` script (invoke directly)
   *   - `source === 'vfs'`:  the bundled `sbt-launch.jar` (invoke as
   *                          `java -jar <path>` via the resolved JRE)
   */
  readonly path: string
  /**
   * `true` if `path` is a Java archive (`*.jar`) that must be invoked
   * via `java -jar`; `false` if it's a direct-executable script.
   */
  readonly isJar: boolean
  readonly source: SbtSource
}
