/**
 * @fileoverview GitHub release download utilities.
 */

import process from 'node:process'

import picomatch from '../external/picomatch'

import {
  type ArchiveFormat,
  detectArchiveFormat,
  extractArchive,
} from '../archives'
import { safeMkdir } from '../fs'
import { httpDownload, httpRequest } from '../http-request'
import { getDefaultLogger } from '../logger'
import {
  ArrayIsArray,
  ErrorCtor,
  JSONParse,
  JSONStringify,
} from '../primordials'
import { pRetry } from '../promises'
import { spawn } from '../spawn'

/**
 * Pattern for matching release assets.
 * Can be either:
 * - A string with glob pattern syntax
 * - A prefix/suffix pair for explicit matching (backward compatible)
 * - A RegExp for complex patterns
 *
 * String patterns support full glob syntax via picomatch.
 * Examples:
 * - Simple wildcard: yoga-sync-*.mjs matches yoga-sync-abc123.mjs
 * - Complex: models-*.tar.gz matches models-2024-01-15.tar.gz
 * - Prefix wildcard: *-models.tar.gz matches foo-models.tar.gz
 * - Suffix wildcard: yoga-* matches yoga-layout
 * - Brace expansion: {yoga,models}-*.{mjs,js} matches yoga-abc.mjs or models-xyz.js
 *
 * For backward compatibility, prefix/suffix objects are still supported but glob patterns are recommended.
 */
export type AssetPattern = string | { prefix: string; suffix: string } | RegExp

/**
 * Configuration for downloading a GitHub release.
 */
export interface DownloadGitHubReleaseConfig {
  /** Asset name on GitHub. */
  assetName: string
  /** Binary filename (e.g., 'node', 'binject'). */
  binaryName: string
  /** Working directory (defaults to process.cwd()). */
  cwd?: string
  /** Download destination directory. @default 'build/downloaded' */
  downloadDir?: string
  /** GitHub repository owner/organization. */
  owner: string
  /** Platform-arch identifier (e.g., 'linux-x64-musl'). */
  platformArch: string
  /** Suppress log messages. @default false */
  quiet?: boolean
  /** Remove macOS quarantine attribute after download. @default true */
  removeMacOSQuarantine?: boolean
  /** GitHub repository name. */
  repo: string
  /** Specific release tag to download. */
  tag?: string
  /** Tool name for directory structure. */
  toolName: string
  /** Tool prefix for finding latest release. */
  toolPrefix?: string
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

/**
 * Retry configuration for GitHub API requests.
 * Uses exponential backoff to handle transient failures and rate limiting.
 */
const RETRY_CONFIG = Object.freeze({
  __proto__: null,
  // Exponential backoff: delay doubles with each retry (5s, 10s, 20s).
  backoffFactor: 2,
  // Initial delay before first retry.
  baseDelayMs: 5000,
  // Maximum number of retry attempts (excluding initial request).
  retries: 2,
})

const logger = getDefaultLogger()

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

/**
 * Lazily load the fs module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load the path module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @returns The Node.js path module
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Create a matcher function for a pattern using picomatch for glob patterns
 * or simple prefix/suffix matching for object patterns.
 *
 * @param pattern - Pattern to match (string glob, prefix/suffix object, or RegExp)
 * @returns Function that tests if a string matches the pattern
 *
 * @example
 * ```typescript
 * const isMatch = createAssetMatcher('tool-*-linux-x64')
 * isMatch('tool-v1.0-linux-x64')  // true
 * isMatch('tool-v1.0-darwin-arm64')  // false
 * ```
 */
export function createAssetMatcher(
  pattern: string | { prefix: string; suffix: string } | RegExp,
): (input: string) => boolean {
  if (typeof pattern === 'string') {
    // Use picomatch for glob pattern matching.
    const isMatch = picomatch(pattern)
    return (input: string) => isMatch(input)
  }

  if (pattern instanceof RegExp) {
    return (input: string) => pattern.test(input)
  }

  // Prefix/suffix object pattern (backward compatible).
  const { prefix, suffix } = pattern
  return (input: string) => input.startsWith(prefix) && input.endsWith(suffix)
}

/**
 * Download and extract an archive from a GitHub release.
 * Supports zip, tar, tar.gz, and tgz formats.
 * Automatically handles downloading, extracting, and cleanup.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param outputDir - Directory to extract the archive contents to
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.quiet - Suppress log messages
 * @param options.cleanup - Remove downloaded archive after extraction (default: true)
 * @param options.strip - Strip leading path components (like tar --strip-components)
 * @param options.format - Archive format (auto-detected if not specified)
 * @returns Path to the extraction directory
 *
 * @example
 * ```typescript
 * const outputDir = await downloadAndExtractArchive(
 *   'v1.0.0', 'data-*.tar.gz', '/tmp/data',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function downloadAndExtractArchive(
  tag: string,
  assetPattern: string | AssetPattern,
  outputDir: string,
  repoConfig: RepoConfig,
  options: {
    cleanup?: boolean
    format?: ArchiveFormat
    quiet?: boolean
    strip?: number
  } = {},
): Promise<string> {
  const { cleanup = true, format, quiet = false, strip } = options

  const path = getPath()
  const fs = getFs()

  await safeMkdir(outputDir)

  // Determine file extension from pattern or format
  let ext = '.archive'
  if (format) {
    ext = format === 'tar.gz' ? '.tar.gz' : `.${format}`
  } else if (typeof assetPattern === 'string') {
    const detectedFormat = detectArchiveFormat(assetPattern)
    if (detectedFormat) {
      ext = detectedFormat === 'tar.gz' ? '.tar.gz' : `.${detectedFormat}`
    }
  }

  // Download archive to temporary location
  const archivePath = path.join(outputDir, `__temp_download__${ext}`)

  if (!quiet) {
    logger.info(`Downloading archive from release ${tag}...`)
  }

  await downloadReleaseAsset(tag, assetPattern, archivePath, repoConfig, {
    quiet,
  })

  if (!quiet) {
    logger.info(`Extracting archive to ${outputDir}...`)
  }

  // Extract archive contents
  try {
    await extractArchive(archivePath, outputDir, { quiet, strip })

    if (!quiet) {
      logger.info(`Extracted archive contents to ${outputDir}`)
    }
  } catch (cause) {
    throw new Error(`Failed to extract archive: ${archivePath}`, { cause })
  } finally {
    // Cleanup temporary archive file if requested
    if (cleanup) {
      try {
        await fs.promises.unlink(archivePath)
        if (!quiet) {
          logger.info('Cleaned up temporary archive file')
        }
      } catch (e) {
        // Ignore cleanup errors
        if (!quiet) {
          logger.warn(`Failed to cleanup archive file: ${e}`)
        }
      }
    }
  }

  return outputDir
}

/**
 * Download and extract a zip file from a GitHub release.
 * Automatically handles downloading, extracting, and cleanup.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param outputDir - Directory to extract the zip contents to
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.quiet - Suppress log messages
 * @param options.cleanup - Remove downloaded zip file after extraction (default: true)
 * @returns Path to the extraction directory
 *
 * @example
 * ```typescript
 * const outputDir = await downloadAndExtractZip(
 *   'v1.0.0', 'models-*.zip', '/tmp/models',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function downloadAndExtractZip(
  tag: string,
  assetPattern: string | AssetPattern,
  outputDir: string,
  repoConfig: RepoConfig,
  options: { cleanup?: boolean; quiet?: boolean } = {},
): Promise<string> {
  const { cleanup = true, quiet = false } = options

  const path = getPath()
  const fs = getFs()

  await safeMkdir(outputDir)

  // Download zip to temporary location
  const zipPath = path.join(outputDir, '__temp_download__.zip')

  if (!quiet) {
    logger.info(`Downloading zip asset from release ${tag}...`)
  }

  await downloadReleaseAsset(tag, assetPattern, zipPath, repoConfig, { quiet })

  if (!quiet) {
    logger.info(`Extracting zip to ${outputDir}...`)
  }

  // Extract zip contents
  try {
    await extractArchive(zipPath, outputDir, { quiet })

    if (!quiet) {
      logger.info(`Extracted zip contents to ${outputDir}`)
    }
  } catch (cause) {
    throw new Error(`Failed to extract zip file: ${zipPath}`, { cause })
  } finally {
    // Cleanup temporary zip file if requested
    if (cleanup) {
      try {
        await fs.promises.unlink(zipPath)
        if (!quiet) {
          logger.info('Cleaned up temporary zip file')
        }
      } catch (e) {
        // Ignore cleanup errors
        if (!quiet) {
          logger.warn(`Failed to cleanup zip file: ${e}`)
        }
      }
    }
  }

  return outputDir
}

/**
 * Download a binary from any GitHub repository with version caching.
 *
 * @param config - Download configuration
 * @returns Path to the downloaded binary
 *
 * @example
 * ```typescript
 * const binaryPath = await downloadGitHubRelease({
 *   owner: 'SocketDev', repo: 'socket-btm',
 *   toolName: 'lief', toolPrefix: 'lief-',
 *   assetName: 'lief-linux-x64', binaryName: 'lief',
 *   platformArch: 'linux-x64',
 * })
 * ```
 */
export async function downloadGitHubRelease(
  config: DownloadGitHubReleaseConfig,
): Promise<string> {
  const {
    assetName,
    binaryName,
    cwd = process.cwd(),
    downloadDir = 'build/downloaded',
    owner,
    platformArch,
    quiet = false,
    removeMacOSQuarantine = true,
    repo,
    tag: explicitTag,
    toolName,
    toolPrefix,
  } = config

  // Get release tag (either explicit or latest).
  let tag: string
  if (explicitTag) {
    tag = explicitTag
  } else if (toolPrefix) {
    const latestTag = await getLatestRelease(toolPrefix, { owner, repo })
    if (!latestTag) {
      throw new Error(`No ${toolPrefix} release found in ${owner}/${repo}`)
    }
    tag = latestTag
  } else {
    throw new Error('Either toolPrefix or tag must be provided')
  }

  const path = getPath()
  // Resolve download directory (can be absolute or relative to cwd).
  const resolvedDownloadDir = path.isAbsolute(downloadDir)
    ? downloadDir
    : path.join(cwd, downloadDir)

  // Caller controls full directory structure (no automatic nesting).
  const binaryDir = resolvedDownloadDir
  const binaryPath = path.join(binaryDir, binaryName)
  const versionPath = path.join(binaryDir, '.version')

  // Check if already downloaded.
  const fs = getFs()
  if (fs.existsSync(versionPath) && fs.existsSync(binaryPath)) {
    const cachedVersion = (
      await fs.promises.readFile(versionPath, 'utf8')
    ).trim()
    // Re-check binary exists after reading version (prevent TOCTOU race)
    if (cachedVersion === tag && fs.existsSync(binaryPath)) {
      if (!quiet) {
        logger.info(`Using cached ${toolName} (${platformArch}): ${binaryPath}`)
      }
      return binaryPath
    }
  }

  // Download the asset.
  if (!quiet) {
    logger.info(`Downloading ${toolName} for ${platformArch}...`)
  }
  await downloadReleaseAsset(
    tag,
    assetName,
    binaryPath,
    { owner, repo },
    { quiet },
  )

  // Make executable on Unix-like systems.
  const isWindows = binaryName.endsWith('.exe')
  if (!isWindows) {
    fs.chmodSync(binaryPath, 0o755)

    // Remove macOS quarantine attribute if present (only on macOS host for macOS target).
    if (
      removeMacOSQuarantine &&
      process.platform === 'darwin' &&
      platformArch.startsWith('darwin')
    ) {
      try {
        await spawn('xattr', ['-d', 'com.apple.quarantine', binaryPath], {
          stdio: 'ignore',
        })
      } catch {
        // Ignore errors - attribute might not exist or xattr might not be available.
      }
    }
  }

  // Write version file.
  await fs.promises.writeFile(versionPath, tag, 'utf8')

  if (!quiet) {
    logger.info(`Downloaded ${toolName} to ${binaryPath}`)
  }

  return binaryPath
}

/**
 * Download a specific release asset.
 * Supports pattern matching for dynamic asset discovery.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param outputPath - Path to write the downloaded file
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 *
 * @example
 * ```typescript
 * await downloadReleaseAsset(
 *   'v1.0.0', 'tool-linux-x64', '/tmp/tool',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function downloadReleaseAsset(
  tag: string,
  assetPattern: string | AssetPattern,
  outputPath: string,
  repoConfig: RepoConfig,
  options: { quiet?: boolean } = {},
): Promise<void> {
  const { owner, repo } = repoConfig
  const { quiet = false } = options

  // Get the browser_download_url for the asset.
  const downloadUrl = await getReleaseAssetUrl(tag, assetPattern, {
    owner,
    repo,
  })

  if (!downloadUrl) {
    const patternDesc =
      typeof assetPattern === 'string' ? assetPattern : 'matching pattern'
    throw new Error(`Asset ${patternDesc} not found in release ${tag}`)
  }

  const path = getPath()
  await safeMkdir(path.dirname(outputPath))

  // Download using httpDownload which supports redirects and retries.
  // httpDownload deletes existing files before downloading to prevent partial/corrupted issues.
  await httpDownload(downloadUrl, outputPath, {
    logger: quiet ? undefined : logger,
    progressInterval: 10,
    retries: 2,
    retryDelay: 5000,
  })
}

/**
 * Get GitHub authentication headers if token is available.
 * Checks GH_TOKEN or GITHUB_TOKEN environment variables.
 *
 * @returns Headers object with Authorization header if token exists.
 *
 * @example
 * ```typescript
 * const headers = getAuthHeaders()
 * // { Accept: 'application/vnd.github+json', Authorization: 'Bearer ...' }
 * ```
 */
export function getAuthHeaders(): Record<string, string> {
  const token = process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN']
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * Internal release row shape used by the listing helpers and the
 * filter pipeline in `getLatestRelease`. Both REST and GraphQL paths
 * normalize their output to this shape so downstream code is unaware
 * of which transport produced the data.
 */
interface ReleaseRow {
  tag_name: string
  published_at: string
  assets: Array<{ name: string }>
}

/**
 * Fetch the latest 100 releases for a repo via REST.
 *
 * Why this returns `[]` on TWO different cases:
 *   - HTTP 200 + zero-byte body. This is the documented GitHub
 *     "search degraded" incident shape (see status.github.com).
 *     The releases listing endpoint shares an Elasticsearch index
 *     with search; when that ES is degraded, `/releases` returns
 *     a successful 200 OK but with NO BODY. There's no error code,
 *     no Retry-After, no rate-limit header — just an empty payload.
 *   - HTTP 200 + literal `[]`. This is the *normal* "the repo has
 *     no releases" response — say a brand-new repo with no
 *     published versions.
 *
 *   Both produce the same `[]` here because the helper can't tell
 *   them apart without context. The CALLER (getLatestRelease) does
 *   the cross-check: if REST returns `[]`, query GraphQL once. If
 *   GraphQL also returns `[]`, the repo really is empty. If it
 *   returns >0, REST was lying and we use GraphQL's answer.
 *
 * Why we throw on non-OK status:
 *   `pRetry` wraps this call and retries on thrown errors with
 *   exponential backoff. A 5xx is transient and worth retrying;
 *   we want it to throw so pRetry can do its job. Empty body is
 *   NOT thrown because pRetry can't help — a 200 OK is "done" as
 *   far as retry policy is concerned.
 */
async function fetchReleasesViaRest(
  owner: string,
  repo: string,
): Promise<ReleaseRow[]> {
  const response = await httpRequest(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
    { headers: getAuthHeaders() },
  )
  if (!response.ok) {
    throw new ErrorCtor(
      `Failed to fetch ${owner}/${repo} releases: ${response.status}`,
    )
  }
  const text = response.body.toString('utf8')
  if (text.length === 0) {
    // 200 OK + empty body — the documented GitHub-search-degraded
    // signature. Return [] so the caller can decide whether to fall
    // back rather than throwing (we don't want pRetry to burn
    // attempts on a known incident shape).
    return []
  }
  let parsed: unknown
  try {
    parsed = JSONParse(text)
  } catch (cause) {
    throw new ErrorCtor(`Failed to parse ${owner}/${repo} releases response`, {
      cause,
    })
  }
  return ArrayIsArray(parsed) ? (parsed as ReleaseRow[]) : []
}

/**
 * Fetch the latest 100 releases for a repo via GraphQL.
 *
 * Why this exists:
 *   `fetchReleasesViaRest` can return `[]` for two reasons (real
 *   empty repo vs. GitHub-incident-degraded backend). When REST
 *   returns nothing, the caller in `getLatestRelease` calls THIS
 *   to disambiguate — if we return >0 here, REST was lying.
 *
 * Field shape diffs we normalize:
 *   GraphQL returns       REST equivalent      Why they differ
 *   `tagName`             `tag_name`           camelCase vs. snake_case
 *   `publishedAt`         `published_at`       camelCase vs. snake_case
 *   `releaseAssets.nodes` `assets`             GraphQL connection
 *                                              wrapper unwrapped
 *
 *   We re-shape inside the `.map(...)` at the bottom so callers
 *   downstream can use the SAME code path regardless of which
 *   transport ran.
 *
 * Why we hit a different backend:
 *   GraphQL queries don't go through the same Elasticsearch index
 *   that REST listings rely on. During incidents that drop the ES
 *   index (or its connectivity), GraphQL's `repository.releases`
 *   connection keeps working because it reads from a different
 *   data path inside GitHub. That's the entire reason this
 *   fallback exists.
 */
async function fetchReleasesViaGraphQL(
  owner: string,
  repo: string,
): Promise<ReleaseRow[]> {
  const response = await httpRequest('https://api.github.com/graphql', {
    body: JSONStringify({
      query: `query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          releases(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes {
              tagName
              publishedAt
              releaseAssets(first: 100) { nodes { name } }
            }
          }
        }
      }`,
      variables: { owner, repo },
    }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new ErrorCtor(
      `Failed to fetch ${owner}/${repo} releases (GraphQL): ${response.status}`,
    )
  }
  let parsed: {
    data?: {
      repository?: {
        releases?: {
          nodes?: Array<{
            tagName: string
            publishedAt: string
            releaseAssets?: { nodes?: Array<{ name: string }> }
          }>
        }
      }
    }
    errors?: Array<{ message: string }>
  }
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch (cause) {
    throw new ErrorCtor(
      `Failed to parse GitHub GraphQL response for ${owner}/${repo} releases`,
      { cause },
    )
  }
  if (parsed.errors?.length) {
    throw new ErrorCtor(
      `GraphQL repository.releases(${owner}/${repo}) returned errors: ${parsed.errors.map(e => e.message).join('; ')}`,
    )
  }
  return (parsed.data?.repository?.releases?.nodes ?? []).map(n => ({
    tag_name: n.tagName,
    published_at: n.publishedAt,
    assets: n.releaseAssets?.nodes ?? [],
  }))
}

/**
 * Fetch the assets of a single release identified by tag via GraphQL.
 *
 * Why this exists:
 *   `getReleaseAssetUrl` uses REST `/releases/tags/:tag` to look
 *   up a single release and find a downloadable asset. During
 *   GitHub incidents that endpoint can return 200 + empty body
 *   the same way the listing endpoint does (the per-tag lookup
 *   joins against the same listing index for asset discovery).
 *   This helper hits GraphQL `repository.release(tagName)` which
 *   uses a different backend.
 *
 * Field shape diff we normalize:
 *   GraphQL returns                       REST equivalent
 *   `releaseAssets.nodes[].downloadUrl`   `assets[].browser_download_url`
 *
 *   Same URL, different field name and one extra connection-wrapper
 *   level. The mapping at the bottom converts so the asset-matcher
 *   in `getReleaseAssetUrl` can run unchanged.
 *
 * Return contract:
 *   - Array of assets (REST shape) when the release exists.
 *   - `undefined` when the release with that tag genuinely doesn't
 *     exist (GraphQL returned `release: null` over the wire — we
 *     translate that to undefined per the codebase convention). The
 *     caller throws a clean "tag not found" error in that case.
 *   - Throws on transport errors (non-OK HTTP, GraphQL errors[],
 *     or even the GraphQL backend ALSO returning empty body — at
 *     that point both transports are degraded and we want the
 *     pRetry wrapper to back off and retry).
 */
async function fetchReleaseAssetsViaGraphQL(
  owner: string,
  repo: string,
  tag: string,
): Promise<Array<{ name: string; browser_download_url: string }> | undefined> {
  const response = await httpRequest('https://api.github.com/graphql', {
    body: JSONStringify({
      query: `query($owner: String!, $repo: String!, $tag: String!) {
        repository(owner: $owner, name: $repo) {
          release(tagName: $tag) {
            tagName
            releaseAssets(first: 100) { nodes { name downloadUrl } }
          }
        }
      }`,
      variables: { owner, repo, tag },
    }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new ErrorCtor(
      `Failed to fetch ${owner}/${repo} release ${tag} (GraphQL): ${response.status} ${response.statusText}`,
    )
  }
  if (response.body.byteLength === 0) {
    throw new ErrorCtor(
      `Failed to fetch ${owner}/${repo} release ${tag}: GraphQL returned empty body`,
    )
  }
  let parsed: {
    data?: {
      repository?: {
        release?: {
          tagName: string
          releaseAssets?: {
            nodes?: Array<{ name: string; downloadUrl: string }>
          }
        } | null
      }
    }
    errors?: Array<{ message: string }>
  }
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch (cause) {
    throw new ErrorCtor(
      `Failed to parse ${owner}/${repo} release ${tag} response (GraphQL)`,
      { cause },
    )
  }
  if (parsed.errors?.length) {
    throw new ErrorCtor(
      `GraphQL repository.release(${owner}/${repo}, ${tag}) returned errors: ${parsed.errors.map(e => e.message).join('; ')}`,
    )
  }
  const release = parsed.data?.repository?.release
  if (!release) {
    return undefined
  }
  // Normalize to REST shape: GraphQL exposes the asset URL as
  // `downloadUrl`, REST as `browser_download_url`. Map so the caller
  // (and the asset-matcher) keep working unchanged.
  return (release.releaseAssets?.nodes ?? []).map(n => ({
    browser_download_url: n.downloadUrl,
    name: n.name,
  }))
}

/**
 * Get latest release tag matching a tool prefix.
 * Optionally filter by releases containing a matching asset.
 *
 * @param toolPrefix - Tool name prefix to search for (e.g., 'node-smol-')
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.assetPattern - Optional pattern to filter releases by matching asset
 * @param options.nothrow - If true, return undefined instead of throwing when both REST and GraphQL backends are degraded. Default: false.
 * @returns Latest release tag or undefined if not found
 * @throws {Error} If both REST and GraphQL backends are degraded and nothrow is false.
 *
 * @example
 * ```typescript
 * const tag = await getLatestRelease('lief-', {
 *   owner: 'SocketDev', repo: 'socket-btm',
 * })
 * console.log(tag) // 'lief-2025-01-15-abc1234'
 * ```
 */
export async function getLatestRelease(
  toolPrefix: string,
  repoConfig: RepoConfig,
  options: {
    assetPattern?: AssetPattern
    nothrow?: boolean
  } = {},
): Promise<string | undefined> {
  // The `quiet` option from previous releases is no longer accepted.
  // The helper is silent by design now (errors throw, success
  // returns) so there's nothing for the caller to suppress. Type
  // enforces this — passing `{ quiet: true }` is a TS error.
  const { assetPattern, nothrow = false } = options
  const { owner, repo } = repoConfig

  // Create matcher function if pattern provided.
  const isMatch = assetPattern ? createAssetMatcher(assetPattern) : undefined

  return (
    (await pRetry(async () => {
      // Fetch via REST first. The REST endpoint is the canonical
      // listing path and is what we want to use when GitHub is
      // healthy. During GitHub Elasticsearch outages (which back the
      // releases listing index) REST can return HTTP 200 with an
      // empty array even when the repo has dozens of releases — see
      // https://www.githubstatus.com incidents tagged "search is
      // degraded". When that happens we fall back to GraphQL, which
      // hits a different backend and stays consistent through ES
      // outages. Per-tag fetches in `getReleaseAssetUrl` go through
      // `/repos/:owner/:repo/releases/tags/:tag` which is unaffected
      // by the listing-index outage, so that helper stays on REST.
      let releases = await fetchReleasesViaRest(owner, repo)
      if (releases.length === 0) {
        // Empty REST response is ambiguous: it could mean the repo
        // genuinely has no releases, or GitHub's listing index is
        // degraded. Cross-check against GraphQL once. If GraphQL
        // also returns 0, the repo really is empty and we report
        // "no match"; if GraphQL returns >0, REST was lying and
        // we silently use the GraphQL result — the caller asked
        // for releases, the helper got them, the transport diff
        // isn't actionable for the user. If GraphQL throws, wrap
        // with a "both transports failed" message so the operator
        // sees the cross-backend signal rather than a bare GraphQL
        // error that looks like an unrelated failure.
        let graphqlReleases: ReleaseRow[]
        try {
          graphqlReleases = await fetchReleasesViaGraphQL(owner, repo)
        } catch (cause) {
          // Library-API error: terse, stable. The verbose
          // explanation lives in the JSDoc / README; callers
          // asserting on .message need a short canonical form.
          // `nothrow: true` callers get undefined (treated as "no
          // releases found") instead of the throw — matches the
          // bin.ts whichReal convention.
          if (nothrow) {
            return undefined
          }
          throw new ErrorCtor(
            `Failed to list ${owner}/${repo} releases: both REST and GraphQL backends degraded`,
            { cause },
          )
        }
        if (graphqlReleases.length > 0) {
          releases = graphqlReleases
        }
      }

      // Filter releases matching the tool prefix.
      const matchingReleases = releases.filter(release => {
        const { assets, tag_name: tag } = release
        if (!tag.startsWith(toolPrefix)) {
          return false
        }

        // Skip releases with no assets (empty releases).
        if (!assets || assets.length === 0) {
          return false
        }

        // If asset pattern provided, check if release has matching asset.
        if (isMatch) {
          const hasMatchingAsset = assets.some((a: { name: string }) =>
            isMatch(a.name),
          )
          if (!hasMatchingAsset) {
            return false
          }
        }

        return true
      })

      if (matchingReleases.length === 0) {
        return undefined
      }

      // Sort by published_at descending (newest first).
      // GitHub API doesn't guarantee order, so we must sort explicitly.
      matchingReleases.sort(
        (a: { published_at: string }, b: { published_at: string }) =>
          new Date(b.published_at).getTime() -
          new Date(a.published_at).getTime(),
      )

      const latestRelease = matchingReleases[0]!
      return latestRelease.tag_name
    }, RETRY_CONFIG)) ?? undefined
  )
}

/**
 * Get download URL for a specific release asset.
 * Supports pattern matching for dynamic asset discovery.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.nothrow - If true, return undefined instead of throwing when both REST and GraphQL backends are degraded. Default: false.
 * @returns Browser download URL for the asset, or undefined when not found.
 * @throws {Error} If both REST and GraphQL backends are degraded and nothrow is false.
 *
 * @example
 * ```typescript
 * const url = await getReleaseAssetUrl(
 *   'v1.0.0', 'tool-linux-x64',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function getReleaseAssetUrl(
  tag: string,
  assetPattern: string | AssetPattern,
  repoConfig: RepoConfig,
  options: { nothrow?: boolean } = {},
): Promise<string | undefined> {
  // The `quiet` option from previous releases is no longer accepted.
  // The helper is silent by design now (errors throw, success
  // returns). Type enforces this — passing `{ quiet: true }` is a TS error.
  const { nothrow = false } = options
  const { owner, repo } = repoConfig

  // Create matcher function for the pattern.
  const isMatch =
    typeof assetPattern === 'string' &&
    !assetPattern.includes('*') &&
    !assetPattern.includes('{')
      ? (input: string) => input === assetPattern
      : createAssetMatcher(assetPattern as AssetPattern)

  return (
    (await pRetry(async () => {
      const response = await httpRequest(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
        {
          headers: getAuthHeaders(),
        },
      )

      if (!response.ok) {
        throw new ErrorCtor(
          `Failed to fetch ${owner}/${repo} release ${tag}: ${response.status}`,
        )
      }

      // -------------------------------------------------------
      // 200 OK + zero-byte body = GitHub Elasticsearch incident.
      // The status says "success" but the payload is empty.
      // Cross-check via GraphQL `repository.release(tagName)`,
      // which uses a different backend — when REST is degraded
      // GraphQL is usually still serving the same data.
      //
      // The two transports expose the SAME asset data with one
      // field-name diff (`downloadUrl` vs. `browser_download_url`)
      // that `fetchReleaseAssetsViaGraphQL` normalizes. After
      // normalization we go back to the SAME asset matcher path
      // below — the rest of the function doesn't know which
      // transport produced the asset list.
      //
      // Three outcomes from the GraphQL fallback:
      //   - assets returned: continue with matching as normal
      //   - `undefined` returned: GraphQL says no release with this
      //     tag exists. Throw a clear error so the user knows
      //     the tag is genuinely missing rather than masking a
      //     transient with a silent skip.
      //   - GraphQL itself throws: `pRetry` retries the whole
      //     `getReleaseAssetUrl` call (REST included). This is
      //     intentional — if both transports fail we want
      //     backoff, not a blind error.
      // -------------------------------------------------------
      let assets: Array<{ name: string; browser_download_url: string }>
      if (response.body.byteLength === 0) {
        // REST is degraded — silently route to GraphQL. Only error
        // out (with a clear, informative message) if BOTH transports
        // fail to return assets for this tag.
        let fallbackAssets:
          | Array<{ name: string; browser_download_url: string }>
          | undefined
        try {
          fallbackAssets = await fetchReleaseAssetsViaGraphQL(owner, repo, tag)
        } catch (cause) {
          // `nothrow: true` callers get undefined instead of the throw.
          if (nothrow) {
            return undefined
          }
          throw new ErrorCtor(
            `Failed to fetch ${owner}/${repo} release ${tag}: both REST and GraphQL backends degraded`,
            { cause },
          )
        }
        if (fallbackAssets === undefined) {
          if (nothrow) {
            return undefined
          }
          throw new ErrorCtor(`Release ${tag} not found in ${owner}/${repo}`)
        }
        assets = fallbackAssets
      } else {
        let release: {
          assets: Array<{ name: string; browser_download_url: string }>
        }
        try {
          release = JSONParse(response.body.toString('utf8'))
        } catch (cause) {
          throw new ErrorCtor(
            `Failed to parse ${owner}/${repo} release ${tag} response`,
            { cause },
          )
        }

        if (!ArrayIsArray(release.assets)) {
          throw new ErrorCtor(
            `Release ${tag} has no assets in ${owner}/${repo}`,
          )
        }
        assets = release.assets
      }

      const asset = assets.find(a => isMatch(a.name))

      if (!asset) {
        const patternDesc =
          typeof assetPattern === 'string' ? assetPattern : 'matching pattern'
        throw new Error(`Asset ${patternDesc} not found in release ${tag}`)
      }

      return asset.browser_download_url
    }, RETRY_CONFIG)) ?? undefined
  )
}
