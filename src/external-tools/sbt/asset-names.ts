/**
 * @file SBT distribution download-URL builder. SBT (Scala Build Tool) ships a
 *   platform-agnostic launcher tarball via GitHub releases
 *   (`sbt-<version>.tgz`). The archive contains a `bin/sbt` script and a
 *   `bin/sbt-launch.jar` — both run on any platform with a JRE available. No
 *   platform-arch query map needed because there's only one asset per version.
 *   We still expose the URL builder so consumers don't encode the release path
 *   in every callsite.
 */

/**
 * Options for {@link getSbtDownloadUrl}.
 */
export interface SbtDownloadOptions {
  /**
   * SBT release version, e.g. `'1.10.7'`. Passed verbatim into the release tag.
   */
  version: string
}

/**
 * Build the GitHub release-asset download URL for the SBT launcher tarball.
 * Always returns a URL — SBT has no per-platform variations.
 *
 * Reference: https://github.com/sbt/sbt/releases.
 *
 * @example
 *   ;```typescript
 *   const url = getSbtDownloadUrl({ version: '1.10.7' })
 *   // → 'https://github.com/sbt/sbt/releases/download/v1.10.7/sbt-1.10.7.tgz'
 *   ```
 */
export function getSbtDownloadUrl(options: SbtDownloadOptions): string {
  const { version } = { __proto__: null, ...options } as typeof options
  return `https://github.com/sbt/sbt/releases/download/v${version}/sbt-${version}.tgz`
}
