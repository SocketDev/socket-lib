/**
 * @file Public types for GitHub release download utilities.
 */

/**
 * Pattern for matching release assets. Can be either:
 *
 * - A string with glob pattern syntax
 * - A prefix/suffix pair for explicit matching (backward compatible)
 * - A RegExp for complex patterns
 *
 * String patterns support full glob syntax via picomatch. Examples:
 *
 * - Simple wildcard: yoga-sync-*.mjs matches yoga-sync-abc123.mjs
 * - Complex: models-*.tar.gz matches models-2024-01-15.tar.gz
 * - Prefix wildcard: *-models.tar.gz matches foo-models.tar.gz
 * - Suffix wildcard: yoga-* matches yoga-layout
 * - Brace expansion: {yoga,models}-*.{mjs,js} matches yoga-abc.mjs or
 *   models-xyz.js
 *
 * For backward compatibility, prefix/suffix objects are still supported but
 * glob patterns are recommended.
 */
export type AssetPattern = string | { prefix: string; suffix: string } | RegExp

/**
 * Configuration for downloading a GitHub release.
 */
export interface DownloadGitHubReleaseConfig {
  /**
   * Asset name on GitHub.
   */
  assetName: string
  /**
   * Binary filename (e.g., 'node', 'binject').
   */
  binaryName: string
  /**
   * Working directory (defaults to process.cwd()).
   */
  cwd?: string | undefined
  /**
   * Download destination directory. @default 'build/downloaded'
   */
  downloadDir?: string | undefined
  /**
   * GitHub repository owner/organization.
   */
  owner: string
  /**
   * Platform-arch identifier (e.g., 'linux-x64-musl').
   */
  platformArch: string
  /**
   * Suppress log messages. @default false.
   */
  quiet?: boolean | undefined
  /**
   * Remove macOS quarantine attribute after download. @default true.
   */
  removeMacOSQuarantine?: boolean | undefined
  /**
   * GitHub repository name.
   */
  repo: string
  /**
   * Specific release tag to download.
   */
  tag?: string | undefined
  /**
   * Tool name for directory structure.
   */
  toolName: string
  /**
   * Tool prefix for finding latest release.
   */
  toolPrefix?: string | undefined
}

/**
 * Configuration for repository access.
 */
export interface RepoConfig {
  /**
   * GitHub repository owner/organization.
   */
  owner: string
  /**
   * GitHub repository name.
   */
  repo: string
}
