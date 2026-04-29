# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.26.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.26.1) - 2026-04-29

### Added

- `effects/shimmer` — pure-functional shimmer engine
- `effects/shimmer-terminal` — terminal (ANSI) renderer for the engine
- `effects/shimmer-keyframes` — SVG keyframe batcher for the engine
- `releases/github-types`, `github-assets`, `github-auth`, `github-api`, `github-downloads`, `github-archives` — six focused submodules replacing the single `releases/github` export

### Changed

- **BREAKING**: `spinner` `ShimmerInfo` shape — `{ direction, speed, frame }` (was: `currentDir`, `mode`, `speed`, `step`). User-facing `ShimmerConfig` is unchanged
- `getLatestRelease` / `getReleaseAssetUrl` return `undefined` (was: `null`) when no result is found, and no longer log on success/retry — errors throw, success returns

### Removed

- **BREAKING**: `effects/text-shimmer`, `effects/ultra`, `effects/types` subpath exports. Migrate to `effects/shimmer` (+ `effects/shimmer-terminal`); `RAINBOW_GRADIENT` now lives in `themes/utils`
- **BREAKING**: `themes` barrel export. Import from `themes/themes`, `themes/context`, `themes/utils`, or `themes/types`
- **BREAKING**: `releases/github` subpath export. Migrate to the focused submodules (see Added)
- `getLatestRelease({ quiet })` / `getReleaseAssetUrl({ quiet })` — the helpers no longer log

### Fixed

- `releases/github-api` `getLatestRelease` and `getReleaseAssetUrl` transparently fall back to GraphQL when GitHub REST returns 200 + empty body (search-degraded incident shape)
- `github` `resolveRefToSha` and `fetchGhsaDetails` get the same GraphQL fallback for the same incident shape
- All fallbacks only fire on the empty-body signature; real 404s, rate-limits, and 5xx still propagate

## [5.26.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.26.0) - 2026-04-27

### Added

- `github` `GitHubEmptyBodyError` — exported error class for GitHub's "search degraded" 200 OK + empty body incident shape
- `nothrow` option on `getLatestRelease` and `getReleaseAssetUrl` — return `undefined` instead of throwing when both REST and GraphQL backends are degraded

### Changed

- `getLatestRelease` / `getReleaseAssetUrl` return `undefined` (was: `null`) when no result is found, and no longer log on success/retry — errors throw, success returns
- `fetchGhsaDetails` GraphQL fallback normalizes severity to lowercase to match REST shape

### Removed

- `getLatestRelease({ quiet })` / `getReleaseAssetUrl({ quiet })` — no longer accepted (the helpers don't log anymore)

### Fixed

- `releases/github` `getLatestRelease` and `getReleaseAssetUrl` fall back to GraphQL on the empty-body incident shape
- `github` `resolveRefToSha` and `fetchGhsaDetails` get the same GraphQL fallback
- All fallbacks fire only on `GitHubEmptyBodyError`; real 404s / rate-limits / 5xx still propagate

## [5.25.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.25.1) - 2026-04-27

### Fixed

- `primordials` `StringPrototypeReplace` / `StringPrototypeReplaceAll` — `replaceValue` accepts the callback form, matching `String.prototype.replace`

## [5.25.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.25.0) - 2026-04-26

### Added

- `primordials` — public module exposing ~100 safe references to built-in constructors, static methods, and prototype methods captured at load time. Static methods keep their name (`ObjectKeys`, `JSONParse`); prototype methods are uncurried (`StringPrototypeSlice(str, 0, 3)`); constructors use a `Ctor` suffix (`MapCtor`, `ErrorCtor`)

## [5.24.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.24.0) - 2026-04-22

### Removed

- `env/socket-cli-shadow` — deleted (unused)

### Fixed

- `packPackage()` / `extractPackage()` work for non-registry specs (local dir/tarball, remote tarball, git)
- `EditablePackageJson.prepare()` no longer throws `git.find is not a function`
- `packPackage(<dir>)` runs `prepack` / `postpack` scripts instead of throwing

## [5.23.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.23.0) - 2026-04-22

### Added

- `errors` `isError(value)` — spec-compliant ES2025 [`Error.isError`](https://tc39.es/ecma262/#sec-error.iserror), cross-realm safe
- `errors` `errorMessage(value)` — readable message from any caught value (Error, primitive, object, nullish) with cause-chain support
- `errors` `errorStack(value)` — cause-aware stack or `undefined`
- `errors` `isErrnoException(value)` — narrows to `NodeJS.ErrnoException`, cross-realm safe
- `errors` re-exports `UNKNOWN_ERROR`

### Changed

- pony-cause `messageWithCauses` / `stackWithCauses` / `findCauseByReference` / `getErrorCause` use `isError` internally — cross-realm Errors are recognized (previously returned `''`)

## [5.22.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.22.0) - 2026-04-21

### Changed

- `releases/socket-btm` `getPlatformArch()` / `getBinaryAssetName()` — aligned with pnpm pack-app's `<os>-<arch>[-<libc>]` format. Windows OS segment is now `win32` (was `win`)

## [5.21.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.21.0) - 2026-04-20

### Added

- `schema/validate` — non-throwing Zod/TypeBox validator returning `{ ok, value } | { ok, errors }`
- `schema/parse` — throwing variant for fail-fast trust boundaries
- `schema/types` — `Schema<T>`, `ValidateResult<T>`, `ValidationIssue`, `AnySchema`, `Infer<S>`
- `promises` `withResolvers()` — spec-compliant [`Promise.withResolvers`](https://tc39.es/ecma262/#sec-promise.withResolvers); uses native when available

### Changed

- `regexps` `escapeRegExp()` — now spec-compliant with TC39 [`RegExp.escape`](https://tc39.es/ecma262/#sec-regexp.escape). **Output shape changed**: many characters now escape to `\xHH` (e.g. `'a'` → `'\x61'`); compiled regex behavior is preserved
- `memoization` `MemoizeOptions<Args>` — dropped unused second type parameter
- `packages/specs` `getRepoUrlDetails()` — accepts `git+https://` / `git+ssh://` GitHub URLs; rejects lookalike hosts. scp-style `git@github.com:…` returns `{ user: '', project: '' }`
- `url` `urlSearchParamAsBoolean()` — accepts the same truthy vocabulary as `envAsBoolean` (`1` / `true` / `yes` / `on`); empty string falls through to `defaultValue`

### Removed

- `validation/*` subpath retired — exports re-homed: `validateSchema` / `parseSchema` → `schema/validate` / `schema/parse`; `safeJsonParse` → `json/parse`; types → `schema/types` and `json/types`
- `memoization` `memoizeDebounced` — use `memoize` / `memoizeAsync` with a `ttl` instead

### Fixed

- `versions` `maxVersion()` / `minVersion()` — return latest/earliest prerelease for all-prerelease inputs
- `fs` `findUp()` / `findUpSync()` — traverse up to and including the filesystem root
- `words` `capitalize()` — safe for non-BMP characters (emoji, astral-plane scripts)
- `words` `determineArticle()` — case-insensitive vowel match
- `archives` `extractZip` / `extractTar` / `extractTarGz` — missing-archive errors uniformly surface as `ENOENT`
- `promise-queue` — bounded queue rejects newest submission when full, preserving in-flight work
- `cacache` / `cache-with-ttl` — wildcard key deletion anchors both ends of the pattern
- `process-lock` — sub-second `staleMs` values honored at full precision; TOCTOU window on acquisition closed
- `suppress-warnings` `withSuppressedWarnings()` — no longer wipes concurrent suppressions on exit
- `dlx` LRU caches capped (binary path, package.json path); negative package.json lookups expire after 10s
- Glob cache keys for array-valued options are order-insensitive

### Performance

- `memoization` cache-hit bookkeeping is now O(1) (was O(n))
- `cacache` wildcard `clear()` no longer recompiles the match regex per entry

## [5.20.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.20.1) - 2026-04-19

### Fixed

- `ipc` — stub-file writes hardened against symlink/TOCTOU attacks (`O_EXCL | O_NOFOLLOW`, ownership + mode validation)
- `cache-with-ttl` `getOrFetch()` — closes concurrent-caller race that fired the fetcher twice
- `cache-with-ttl` — in-memory memo layer capped via LRU (`memoMaxSize`, default 1000)
- `memoization` `memoizeAsync()` — refreshes entry timestamp on resolve so slow fetches aren't immediately classified as expired
- `tables` — `displayWidth` measures rendered terminal cells via `stringWidth` (CJK / emoji / combining marks align correctly)
- `paths/packages` — `resolvePackageJsonDirname` / `resolvePackageJsonPath` no longer mis-identify files like `/foo/my-package.json`

## [5.20.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.20.0) - 2026-04-19

### Added

- `validation/validate-schema` — universal Zod-style schema validator with `validateSchema` (tagged result) and `parseSchema` (throwing). No runtime `zod` dep

> **Deprecated in 5.21.0**: moved to `schema/*`.

### Fixed

- `promise-queue` — sync throws inside a queued task convert to proper rejections (no longer escape as uncaught)
- `stdio/progress` `formatTime()` — clamps negative milliseconds (no negative ETAs)
- `dlx/lockfile` — scratch-directory cleanup no longer clobbers the real exception
- `dlx/package` `parsePackageSpec` — bare trailing `@` (e.g. `"pkg@"`) normalizes to `version: undefined`

## [5.19.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.19.1) - 2026-04-19

### Fixed

- Restored `stdio/prompts`, `stdio/progress`, and `stdio/clear` — accidentally removed in 5.19.0

## [5.19.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.19.0) - 2026-04-19

### Added

- `dlx/integrity` — hash verification utilities (`normalizeHash`, `computeHashes`, `verifyHash` with constant-time compare, `DlxHashMismatchError`)
- `dlx/arborist` — hardened `@npmcli/arborist` wrappers (`safeIdealTree`, `safeReify`, `writeSafeNpmrc`). Locks down audit/fund/scripts/etc. Supports `before?: Date` for release-age enforcement
- `dlx/lockfile` `generatePackagePin()` — returns `{ name, version, hash, packageJson, lockfile }`. Default `minReleaseDays: 7` refuses versions published in the last week
- `DlxPackageOptions.hash`, `.lockfile`, `DlxBinaryOptions.hash` — integrity + lockfile options on dlx entry points

### Fixed

- `pacote` shim exposes `tarball`, `manifest`, `packument` alongside `extract`

### Changed

- `dist/external/npm-pack.js` 30% smaller; `dist/external/zod.js` 51% smaller (unused code paths stubbed)

## [5.18.2](https://github.com/SocketDev/socket-lib/releases/tag/v5.18.2) - 2026-04-14

### Removed

- `plugins/` directory + `./plugins/babel-plugin-inline-require-calls` — unused

## [5.18.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.18.1) - 2026-04-14

### Changed

- `dist/external/npm-pack` deduplicated via `pnpm overrides` — 22 duplicate packages removed, ~130 KB smaller

## [5.18.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.18.0) - 2026-04-14

### Added

- `dlx` — Socket Firewall API check before package downloads. Resolves the dependency tree and blocks on critical/high alerts

### Changed

- `http-request` default `User-Agent` is now `socketsecurity-lib/{version}` (was `socket-registry/1.0`)

## [5.17.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.17.0) - 2026-04-14

### Added

- `paths` `isUnixPath()` — detects MSYS/Git Bash drive-letter notation (`/c/...`)

### Changed

- `paths` `normalizePath()` converts MSYS drive letters on Windows (`/c/path` → `C:/path`)
- `paths` `fromUnixPath()` produces native Windows paths with backslashes (`/c/path` → `C:\path`)

## [5.16.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.16.0) - 2026-04-14

### Added

- `paths` `fromUnixPath()` — convert MSYS/Git Bash paths back to native Windows format (#168)

### Fixed

- `dlx` `isInSocketDlx` normalizes the dlx directory path on Windows

## [5.15.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.15.0) - 2026-04-06

### Added

- `http-request` `stream` option — resolves immediately after headers arrive, leaving the body unconsumed for piping
- `http-request` — `headers`, `ok`, `status`, `statusText` fields on `HttpDownloadResult`

## [5.14.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.14.0) - 2026-04-06

### Added

- `http-request`:
  - `HttpResponseError` — thrown on non-2xx when `throwOnError` is set
  - `throwOnError` option — non-2xx responses throw instead of resolving with `ok: false`
  - `onRetry` callback — customize retry per attempt
  - Streaming body support — `body` accepts `Readable` streams (incl. `form-data`)
  - `parseRetryAfterHeader()` — RFC 7231 §7.1.3 parser
  - `sanitizeHeaders()` — redact sensitive headers for logging

### Changed

- `http-request` `HttpRequestOptions.body` widened to `Buffer | Readable | string`; `onResponse` errors no longer leave promises pending

## [5.13.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.13.0) - 2026-04-05

### Added

- `http-request` `readIncomingResponse()` — reads and buffers a Node.js response into an `HttpResponse` (#143)
- `http-request` `IncomingResponse` / `IncomingRequest` type aliases — disambiguate `IncomingMessage` direction

### Changed

- `HttpResponse.rawResponse` type narrowed from `IncomingMessage` to `IncomingResponse`

## [5.12.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.12.0) - 2026-04-04

### Added

- `http-request` lifecycle hooks (`onRequest` / `onResponse`) on `HttpRequestOptions` — fire per-attempt; retries and redirects each trigger separate calls (#133)
- `http-request` `maxResponseSize` option — reject responses exceeding a byte limit (works through redirects, `httpJson`, `httpText`)
- `http-request` `HttpResponse.rawResponse` — underlying `IncomingMessage`
- `http-request` `enrichErrorMessage()` exported

### Changed

- Error messages now include HTTP method and URL
- `HttpResponse.headers` type changed to `IncomingHttpHeaders`

## [5.11.4](https://github.com/SocketDev/socket-lib/releases/tag/v5.11.4) - 2026-03-28

### Performance

- Lazy-load heavy external sub-bundles across 7 modules (#119) — `sorts`, `versions`, `archives`, `globs`, `fs`, `spawn`, `strings`. Lightweight imports no longer load heavy externals at init

## [5.11.3](https://github.com/SocketDev/socket-lib/releases/tag/v5.11.3) - 2026-03-26

### Fixed

- `releases` — in-memory TTL cache for GitHub API responses; guard against missing assets in release response (#112)
- `process-lock` — Windows path separator handling for lock directory creation (#112)

## [5.11.2](https://github.com/SocketDev/socket-lib/releases/tag/v5.11.2) - 2026-03-24

### Added

- `http-request` — custom CA certificate support (`ca` option on `httpRequest`, `httpJson`, `httpText`, `httpDownload`, `fetchChecksums`). Enables `SSL_CERT_FILE` support when `NODE_EXTRA_CA_CERTS` is unavailable at process startup

## [5.11.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.11.1) - 2026-03-24

### Added

- `dlx/binary` — `sha256` option on `dlxBinary()`, `downloadBinary()`, `downloadBinaryFile()`. Verification happens during download (fails early on mismatch). Complements the existing `integrity` (SRI sha512) option

## [5.11.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.11.0) - 2026-03-23

### Added

- `http-request` `parseChecksums(text)` — parse GNU / BSD / single-space checksum file formats; CRLF and LF line endings; null-prototype map
- `http-request` `fetchChecksums(url, options?)` — fetch and parse checksums from URL; supports `headers` and `timeout`
- `http-request` `httpDownload` `sha256` option — verifies before atomic rename (file not saved on mismatch); accepts uppercase hashes

## [5.10.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.10.0) - 2026-03-14

### Changed

- **BREAKING**: `releases/socket-btm` `downloadSocketBtmRelease()` — tool name moved to required first parameter; config object now optional second parameter. Automatic `/${toolName}/${platformArch}` directory nesting removed (callers now control the full path).
  - Before: `downloadSocketBtmRelease({ tool: 'lief', downloadDir: 'build' })`
  - After: `downloadSocketBtmRelease('lief', { downloadDir: 'build' })`

## [5.9.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.9.1) - 2026-03-14

### Fixed

- `fs` `safeDelete()` and `safeDeleteSync()` now properly implement retry logic. Previously `maxRetries` was incorrectly passed as `concurrency` to `del`. Both now use exponential backoff (`backoffFactor: 2`); `maxRetries` and `retryDelay` in `RemoveOptions` work as documented

## [5.9.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.9.0) - 2026-03-14

### Changed

- **BREAKING**: `releases/socket-btm` `getPlatformArch()` normalizes Windows to `win` (was `win32`) — returns `win-x64`, `win-arm64`. Throws on unknown platforms. (Reverted in 5.22.0 back to `win32`)

## [5.8.2](https://github.com/SocketDev/socket-lib/releases/tag/v5.8.2) - 2026-03-13

### Fixed

- `http-request` — downloads write to `{destPath}.download` temp file then atomically rename. Prevents partial/corrupted files from CI caching causing extraction failures

## [5.8.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.8.1) - 2026-03-11

### Performance

- Comprehensive caching for expensive PATH/realpath/git/package.json lookups across `bin`, `spawn`, `git`, `paths`, and `process-lock`. All caches validate entries via `existsSync()` and evict stale ones

## [5.8.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.8.0) - 2026-03-10

### Added

- `archives` — secure archive extraction for ZIP / TAR / TAR.GZ / TGZ. Configurable `maxFileSize` (100MB) and `maxTotalSize` (1GB). Path-traversal protection, symlink blocking, strip option. Exports: `detectArchiveFormat`, `extractArchive`, `extractTar`, `extractTarGz`, `extractZip`
- `releases/github` `downloadAndExtractArchive()` — generic archive download and extract; auto-detects format

### Changed

- 14 external bundle packages deduplicated via pnpm overrides + patches

## [5.7.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.7.0) - 2026-02-12

### Added

- `env` `isInEnv(key)` — `true` whenever the key exists, regardless of value (empty string, `"false"`, `"0"` all count)
- `dlx` helpers exposed: `downloadBinaryFile`, `ensurePackageInstalled`, `getBinaryCacheMetadataPath`, `isBinaryCacheValid`, `makePackageBinsExecutable`, `parsePackageSpec`, `resolveBinaryPath`, `writeBinaryCacheMetadata`
- `releases` `createAssetMatcher()` — matcher fn for glob / prefix-suffix / RegExp asset patterns

### Changed

- `env` `getCI()` now uses `isInEnv('CI')` — `true` whenever the key exists, matching standard CI-detection convention

### Fixed

- **github**: Fixed JSON parsing crash vulnerability by adding try-catch around `JSON.parse()` in GitHub API responses
  - Prevents crashes on malformed, incomplete, or binary responses
  - Error messages now include the response URL for better debugging

- **dlx/binary**: Fixed clock skew vulnerabilities in cache validation
  - Cache entries with future timestamps (clock skew) are now treated as expired
  - Metadata writes now use atomic write-then-rename pattern to prevent corruption
  - Added TOCTOU race protection by re-checking binary existence after metadata read

- **dlx/cache cleanup**: Fixed handling of future timestamps during cache cleanup
  - Entries with future timestamps (due to clock skew) are now properly treated as expired

- **dlx/package**: Fixed scoped package parsing bug where `@scope/package` was incorrectly parsed
  - Changed condition from `startsWith('@')` to `atIndex === 0` for more precise detection
  - Fixes installation failures for scoped packages like `@socketregistry/lib`

- **cache-with-ttl**: Added clock skew detection to TTL cache
  - Far-future `expiresAt` values (>2x TTL) are now treated as expired
  - Protects against cache poisoning from clock skew

- **packages/specs**: Fixed unconditional `.git` truncation in Git URL parsing
  - Now only removes `.git` suffix when URL actually ends with `.git`
  - Prevents incorrect truncation of URLs containing `.git` in the middle

- **releases/github**: Fixed TOCTOU race condition in binary download verification
  - Re-checks binary existence after reading version file
  - Ensures binary is re-downloaded if missing despite version file presence

- **provenance**: Fixed incorrect package name in provenance workflow
  - Changed from `@socketregistry/lib` to `@socketsecurity/lib`

## [5.6.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.6.0) - 2026-02-08

### Added

- `http-request` `httpJson()` / `httpText()` automatically set `Accept` and `Content-Type` headers (when body present); user headers override

### Changed

- **BREAKING**: `http-request` `httpGetJson()` → `httpJson()` and `httpGetText()` → `httpText()`. Functions now accept `method` (defaults to `'GET'`), supporting all HTTP verbs

### Fixed

- `http-request` — empty-string body no longer triggers `Content-Type`

## [5.5.3](https://github.com/SocketDev/socket-lib/releases/tag/v5.5.3) - 2026-01-20

### Fixed

- Patched `execa@2.1.0` for `signal-exit` v4 compatibility (named export)

## [5.5.2](https://github.com/SocketDev/socket-lib/releases/tag/v5.5.2) - 2026-01-20

### Changed

- `dlx/package` uses `getSocketCacacheDir()` (was `getPacoteCachePath()`) for Arborist cache config — removes dependency on pacote cache-path extraction

## [5.5.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.5.1) - 2026-01-12

### Fixed

- dotenvx compatibility with pre-commit hooks
- Empty releases being returned by latest-release lookup

## [5.5.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.5.0) - 2026-01-12

### Added

- `dlx/detect` — `detectDlxExecutableType`, `detectExecutableType`, `detectLocalExecutableType`, `isJsFilePath`, `isNativeBinary`, `isNodePackage`. Distinguishes Node packages from native binaries in DLX cache and on local filesystem

### Fixed

- `releases/github` — sort releases by `published_at` to reliably find latest (was relying on creation order)

## [5.4.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.4.1) - 2026-01-10

### Fixed

- Removed `debug` module stub to bundle the real package — stub was missing `enable()` / `disable()`

## [5.4.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.4.0) - 2026-01-07

### Added

- `releases/github` — `getReleaseAssetUrl()`, `downloadReleaseAsset()`, `getLatestRelease()` accept glob patterns (wildcards, brace expansion, RegExp) via picomatch
- `releases/socket-btm` `downloadSocketBtmRelease()` — `asset` parameter accepts glob patterns

## [5.3.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.3.0) - 2026-01-07

### Added

- `releases/socket-btm` exports: `detectLibc`, `getBinaryAssetName`, `getBinaryName`, `getPlatformArch`
- `releases/github` exports `getAuthHeaders()` — checks `GH_TOKEN` / `GITHUB_TOKEN`

## [5.2.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.2.1) - 2026-01-06

### Fixed

- `releases` — `downloadGitHubRelease()` uses sync `chmodSync()` to prevent "Text file busy" race in CI

## [5.2.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.2.0) - 2026-01-06

### Added

- `releases/github` — `downloadGitHubRelease()` for any GitHub repo
- `releases/socket-btm` — `downloadSocketBtmRelease()` wrapper. Version caching via `.version` files; cross-platform with auto platform/arch detection; Linux musl/glibc support; macOS quarantine attribute auto-removal; generic asset downloads (WASM, models)

## [5.1.4](https://github.com/SocketDev/socket-lib/releases/tag/v5.1.4) - 2025-12-30

### Fixed

- Removed unnecessary `http2` module dependency from `@sigstore/sign@4.1.0` via pnpm override + patch — eliminates loading `node:http2` for HTTP/1.1-only operations

## [5.1.3](https://github.com/SocketDev/socket-lib/releases/tag/v5.1.3) - 2025-12-29

### Fixed

- `http-request` `httpDownload()` follows 3xx redirects. New `followRedirects` (default `true`) and `maxRedirects` (default `5`) options. Resolves "Request quota exhausted" when downloading GitHub release assets

## [5.1.2](https://github.com/SocketDev/socket-lib/releases/tag/v5.1.2) - 2025-12-28

### Fixed

- `paths` — `getSocketDlxDir()` now uses `getPathValue()` caching consistent with the other Socket-dir helpers. Adds test override via `setPath('socket-dlx-dir', ...)`

## [5.1.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.1.1) - 2025-12-28

### Added

- `paths` `SOCKET_HOME` env var support — customize Socket base directory. Priority: `SOCKET_DLX_DIR` > `SOCKET_HOME/_dlx` > `~/.socket/_dlx`

### Changed

- `paths` `getUserHomeDir()` falls back to `os.tmpdir()` when home dir is unavailable. Priority: `HOME` > `USERPROFILE` > `os.homedir()` > `os.tmpdir()`

## [5.1.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.1.0) - 2025-12-17

### Added

- `types` `PURL_Type` — added `ALPM` (Arch Linux) and `VSCODE` (VS Code extensions)

## [5.0.2](https://github.com/SocketDev/socket-lib/releases/tag/v5.0.2) - 2025-12-15

### Changed

- `signal-exit` `signals()` auto-initializes its internal state

## [5.0.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.0.1) - 2025-12-11

### Added

- `http-request` `httpDownload()` automatic progress logging — `logger` option for a Logger instance, `progressInterval` option (default `10%`). `onProgress` callback takes precedence over `logger`

## [5.0.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.0.0) - 2025-12-04

### Added

- `json/edit` `EditableJson` — base class for generic JSON file manipulation with formatting preservation
- `json/format` — JSON formatting utilities
- `json/parse` — `isJsonPrimitive`, `jsonParse` (with error handling)
- `json/types` — JSON type definitions
- `dlx/cache` `generateCacheKey()` — DLX package cache keys
- `dlx/dir` — `clearDlx`, `clearDlxSync`, `dlxDirExists`, `dlxDirExistsAsync`, `ensureDlxDir`, `ensureDlxDirSync`
- `dlx/packages` — `isDlxPackageInstalled`, `listDlxPackages`, `removeDlxPackage` (+ async/sync variants)
- `dlx/paths` — `getDlxPackageDir`, `getDlxInstalledPackageDir`, `getDlxPackageJsonPath`, `getDlxPackageNodeModulesDir`, `isInSocketDlx`

### Changed

- **BREAKING**: Module path reorganization:
  - `json/editable` → `json/edit`
  - `packages/editable` → `packages/edit`
  - `maintained-node-versions`, `package-default-node-range`, `package-default-socket-categories`, `lifecycle-script-names` → moved under `constants/`
  - `dlx` → split into `dlx/cache`, `dlx/dir`, `dlx/packages`, `dlx/paths`
  - `dlx-binary` → `dlx/binary`; `dlx-manifest` → `dlx/manifest`; `dlx-package` → `dlx/package`

## [4.4.0](https://github.com/SocketDev/socket-lib/releases/tag/v4.4.0) - 2025-11-25

### Added

- `fs` `normalizeEncoding()` — case-insensitive encoding normalization with aliases (`binary` → `latin1`, `ucs-2` → `utf16le`); defaults to `utf8`

### Fixed

- `fs` `safeReadFile` / `safeReadFileSync` — corrected type overloads (`encoding: null` → `Buffer`; no encoding → `string`)
- `suppress-warnings` `withSuppressedWarnings()` — properly restores state, only removing warnings the function added

## [4.3.0](https://github.com/SocketDev/socket-lib/releases/tag/v4.3.0) - 2025-11-20

### Added

- `globs` `glob()` / `globSync()` — wrapper functions for fast-glob with normalized options

## [4.1.0](https://github.com/SocketDev/socket-lib/releases/tag/v4.1.0) - 2025-11-17

### Added

- `constants/node` — `getNodeMinorVersion()`, `getNodePatchVersion()`

### Fixed

- `constants/node` `getNodeHardenFlags()` — `--experimental-permission` guarded for Node 20-23; `--permission` for Node 24+; `--force-node-api-uncaught-exceptions-policy` for Node 22+. Removed `--experimental-policy`

## [4.0.1](https://github.com/SocketDev/socket-lib/releases/tag/v4.0.1) - 2025-11-17

### Changed

- Replaced `#`-path imports with relative paths

## [4.0.0](https://github.com/SocketDev/socket-lib/releases/tag/v4.0.0) - 2025-11-15

### Changed

- **BREAKING**: `paths` reorganized into dedicated `paths/*` submodules
- Lazy `require()` calls converted to ES6 static imports for better tree-shaking

## [3.5.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.5.0) - 2025-11-14

### Added

- `argv/quote` — `posixQuote(arg)` (single-quote for bash/sh/zsh) and `win32Quote(arg)` (double-quote for cmd.exe). Use when invoking `spawn()` with `shell: true`

## [3.4.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.4.0) - 2025-11-14

### Added

- `Spinner` `skip(text)` / `skipAndStop(text)` — display skip messages with cyan ↻ symbol
- `Logger` `skip(message)` and `LOG_SYMBOLS.skip`

## [3.3.11](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.11) - 2025-11-14

### Fixed

- `prompts` — "inquirerPrompt is not a function" when inquirer modules expose multiple exports (select, search)

## [3.3.10](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.10) - 2025-11-14

### Fixed

- `string-width@8.1.0` and `wrap-ansi@9.0.2` overrides for `strip-ansi@7.1.2` compatibility

## [3.3.9](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.9) - 2025-11-14

### Fixed

- `strip-ansi@7.1.2` override for `ansi-regex@6.2.2` compatibility

## [3.3.8](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.8) - 2025-11-14

### Fixed

- `spinner` — clear remaining artifacts after `withSpinner` stops (rogue spinner characters)

## [3.3.7](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.7) - 2025-11-13

### Changed

- Explicit `.js` extensions on external `require()` calls for modern bundler compat

## [3.3.6](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.6) - 2025-11-13

### Changed

- pnpm overrides consolidate `@npmcli/arborist@9.1.6`, `@npmcli/run-script@10.0.0`, `semver@7.7.2`, `ansi-regex@6.2.2`, `lru-cache@11.2.2` to single versions

## [3.3.5](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.5) - 2025-11-13

### Fixed

- Patches to prevent `node-gyp` bundling issues

## [3.3.4](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.4) - 2025-11-13

### Fixed

- `node-gyp` marked external in `npm-pack` bundle

## [3.3.3](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.3) - 2025-11-13

### Fixed

- `node-gyp` string broken to prevent bundler ESM/CJS interop issues

## [3.3.2](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.2) - 2025-11-13

### Changed

- `dlx` installs package dependencies after download
- npm package bundle sizes reduced ~3 MB

## [3.3.1](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.1) - 2025-11-11

### Added

- `SOCKET_DOCS_CONTACT_URL` constant
- `checkbox` prompt support

## [3.3.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.3.0) - 2025-11-07

### Added

- `Spinner` `reason(text)` / `reasonAndStop(text)` — display working/thinking output
- `Logger` `reason(message)` and `LOG_SYMBOLS.reason`

## [3.2.8](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.8) - 2025-11-05

### Fixed

- CommonJS export script edge cases (stray semicolons after comment placeholders; incorrect `module.exports.default` → `module.module.exports`)

## [3.2.7](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.7) - 2025-11-05

### Fixed

- External dependency minification disabled to preserve exports (was breaking `semver.parse()`, `semver.major()`)
- CommonJS export interop for TypeScript `export default` no longer needs `.default` accessor

## [3.2.6](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.6) - 2025-11-05

### Fixed

- `logger` and `stdio/prompts` — manual ANSI escape sequences for RGB colors (yoctocolors-cjs has no `rgb()` method)

## [3.2.5](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.5) - 2025-11-05

### Added

- Path alias resolution in build pipeline — `#lib/*` / `#constants/*` aliases resolve to relative paths in compiled CommonJS

## [3.2.4](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.4) - 2025-11-04

### Added

- `Logger` `time()` — start a named timer; returns `stop()` that logs completion with formatted duration

### Fixed

- Star spinner frames — added trailing space for consistent spacing

## [3.2.2](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.2) - 2025-11-03

### Added

- `dlx` `makePackageBinsExecutable()` — chmod 0o755 on all package binaries (no-op on Windows)
- `dlx` `findBinaryPath()` adopts npm's resolution strategy (vendored `getBinFromManifest` from libnpmexec)

### Performance

- Bundle size reduced ~1.3 MB total — vendored `getBinFromManifest` (1.1 MB savings) + minimized exports for `fast-sort`, `fast-glob`, `del`, `streaming-iterables`

## [3.2.1](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.1) - 2025-11-02

### Changed

- **Logger/Spinner**: Use module-level constants to prevent duplicate and rogue spinner indicators
  - Call `getDefaultLogger()` and `getDefaultSpinner()` once at module scope instead of repeated calls
  - Prevents multiple spinner instances that can cause duplicate or lingering indicators in terminal output
  - Applied in `src/dlx-manifest.ts`, `src/stdio/mask.ts`, and `src/spinner.ts`
  - Follows DRY principle and aligns with socket-registry/socket-sdk-js patterns

### Fixed

- **Scripts**: Fixed undefined logger variable in update script
  - Replaced undefined `log` references with `_logger` throughout `scripts/update.mjs`
  - Resolves ESLint errors that blocked test execution
- **Tests**: Improved stdout test stability by checking call delta instead of absolute counts
  - Fixed flaky CI failures where spy call count was 101 instead of expected 100
  - More robust approach handles potential state leakage between tests
- **Tests**: Removed unnecessary 10ms delay in cache-with-ttl test
  - Cache with memoization enabled updates in-memory storage synchronously
  - Delay was insufficient in CI and unnecessary given synchronous behavior
  - Resolves flaky CI failures where cached values returned undefined

## [3.2.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.0) - 2025-11-02

### Added

- **DLX**: Unified manifest for packages and binaries
  - Centralized manifest system for tracking DLX-compatible packages
  - Simplifies package and binary lookups for dependency-free execution

## [3.1.3](https://github.com/SocketDev/socket-lib/releases/tag/v3.1.3) - 2025-11-02

### Changed

- **Dependencies**: Updated `@socketregistry/packageurl-js` to 1.3.5

## [3.1.2](https://github.com/SocketDev/socket-lib/releases/tag/v3.1.2) - 2025-11-02

### Fixed

- **External dependencies**: Fixed incorrectly marked external dependencies to use wrapper pattern
  - Updated `src/constants/agents.ts` to use `require('../external/which')` instead of direct imports
  - Updated `src/zod.ts` to export from `./external/zod'` instead of direct imports
  - Maintains zero dependencies policy by ensuring all runtime dependencies go through the external wrapper pattern
- **Spinner**: Fixed undefined properties in setShimmer by handling defaults correctly

## [3.1.1](https://github.com/SocketDev/socket-lib/releases/tag/v3.1.1) - 2025-11-02

### Fixed

- **Cache TTL**: Fixed flaky test by handling persistent cache write failures gracefully
  - Wrapped `cacache.put` in try/catch to prevent failures when persistent cache writes fail or are slow
  - In-memory cache is updated synchronously before the persistent write, so immediate reads succeed regardless of persistent cache state
  - Improves reliability in test environments and when cache directory has issues

## [3.1.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.1.0) - 2025-11-01

### Changed

- **File system utilities**: `safeMkdir` and `safeMkdirSync` now default to `recursive: true`
  - Nested directories are created by default, simplifying common usage patterns

## [3.0.6](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.6) - 2025-11-01

### Added

- **Build validation**: Added guard against `link:` protocol dependencies in package.json
  - New `validate-no-link-deps.mjs` script automatically runs during `pnpm run check`
  - Prevents accidental publication with `link:` dependencies which can cause issues
  - Recommends using `workspace:` for monorepos or `catalog:` for centralized version management
  - Validates all dependency fields: dependencies, devDependencies, peerDependencies, optionalDependencies

### Changed

- **Dependencies**: Updated `@socketregistry/packageurl-js` to 1.3.3
- **Git hooks**: Committed pre-commit and pre-push hook configurations for version control
- **Scripts**: Removed shebang from `validate-no-link-deps` script (Node.js script, not shell)

## [3.0.5](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.5) - 2025-11-01

### Fixed

- **Critical: Prompts API breaking changes**: Restored working prompts implementation that was accidentally replaced with non-functional stub in v3.0.0
  - Consolidated all prompts functionality into `src/stdio/prompts.ts`
  - Removed unimplemented stub from `src/prompts/` that was throwing "not yet implemented" errors
  - Removed `./prompts` package export (use `@socketsecurity/lib/stdio/prompts` instead)
  - Restored missing exports: `password`, `search`, `Separator`, and added `createSeparator()` helper
  - Fixed `Choice` type to use correct `name` property (matching `@inquirer` API, not erroneous `label`)

### Added

- **Theme integration for prompts**: Prompts now automatically use the active theme colors
  - Prompt messages styled with `colors.prompt`
  - Descriptions and disabled items styled with `colors.textDim`
  - Answers and highlights styled with `colors.primary`
  - Error messages styled with `colors.error`
  - Success indicators styled with `colors.success`
  - Exported `createInquirerTheme()` function for converting Socket themes to @inquirer format
  - Consistent visual experience with Logger and Spinner theme integration

- **Theme parameter support**: Logger, Prompts, and text effects now accept optional `theme` parameter
  - Pass theme names (`'socket'`, `'sunset'`, `'terracotta'`, `'lush'`, `'ultra'`) or Theme objects
  - **Logger**: `new Logger({ theme: 'sunset' })` - uses theme-specific symbol colors
  - **Prompts**: `await input({ message: 'Name:', theme: 'ultra' })` - uses theme for prompt styling
  - **Text effects**: `applyShimmer(text, state, { theme: 'terracotta' })` - uses theme for shimmer colors
  - Instance-specific themes override global theme context when provided
  - Falls back to global theme context when no instance theme specified
  - **Note**: Spinner already had theme parameter support in v3.0.0

### Removed

- **Unused index entrypoint**: Removed `src/index.ts` and package exports for `"."` and `"./index"`
  - This was a leftover from socket-registry and not needed for this library
  - Users should import specific modules directly (e.g., `@socketsecurity/lib/logger`)
  - Breaking: `import { getDefaultLogger } from '@socketsecurity/lib'` no longer works
  - Use: `import { getDefaultLogger } from '@socketsecurity/lib/logger'` instead

## [3.0.4](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.4) - 2025-11-01

### Changed

- **Sunset theme**: Updated colors from azure blue to warm orange/purple gradient matching Coana branding
- **Terracotta theme**: Renamed from `brick` to `terracotta` for better clarity

## [3.0.3](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.3) - 2025-11-01

### Fixed

- **Critical: Node.js ESM/CJS interop completely fixed**: Disabled minification to ensure proper ESM named import detection
  - Root cause: esbuild minification was breaking Node.js ESM's CJS named export detection
  - Solution: Disabled minification entirely (`minify: false` in esbuild config)
  - Libraries should not be minified - consumers minify during their own build process
  - Unminified esbuild output uses clear `__export` patterns that Node.js ESM natively understands
  - Removed `fix-commonjs-exports.mjs` build script - no longer needed with unminified code
  - ESM imports now work reliably: `import { getDefaultLogger } from '@socketsecurity/lib/logger'`
  - Verified with real-world ESM module testing (`.mjs` files importing from CJS `.js` dist)

## [3.0.2](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.2) - 2025-11-01

### Fixed

- **Critical: Node.js ESM named imports from CommonJS**: Fixed build output to ensure Node.js ESM can properly detect named exports from CommonJS modules
  - Previously, esbuild's minified export pattern placed `module.exports` before variable definitions, causing "Cannot access before initialization" errors
  - Build script now uses `@babel/parser` + `magic-string` for safe AST parsing and transformation
  - Exports are now correctly placed at end of files after all variable definitions
  - Enables proper ESM named imports: `import { getDefaultLogger, Logger } from '@socketsecurity/lib/logger'`
  - Fixes socket-cli issue where named imports were failing with obscure initialization errors

## [3.0.1](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.1) - 2025-11-01

### Added

- **Convenience exports from main index**: Added logger and spinner exports to ease v2→v3 migration
  - Logger: `getDefaultLogger()`, `Logger`, `LOG_SYMBOLS` now available from `@socketsecurity/lib`
  - Spinner: `getDefaultSpinner()`, `Spinner` now available from `@socketsecurity/lib`
  - Both main index (`@socketsecurity/lib`) and subpath (`@socketsecurity/lib/logger`, `@socketsecurity/lib/spinner`) imports now work
  - Both import paths return the same singleton instances

### Fixed

- **Critical: Spinner crashes when calling logger**: Fixed spinner internal calls to use `getDefaultLogger()` instead of removed `logger` export
  - Spinner methods (`start()`, `stop()`, `success()`, `fail()`, etc.) no longer crash with "logger is not defined" errors
  - All 5 internal logger access points updated to use the correct v3 API
  - Resolves runtime errors when using spinners with hoisted variables

### Changed

- **Migration path improvement**: Users can now import logger/spinner from either main index or subpaths, reducing breaking change impact from v3.0.0

## [3.0.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.0) - 2025-11-01

### Added

- Theme system with 5 built-in themes: `socket`, `sunset`, `terracotta`, `lush`, `ultra`
- `setTheme()`, `getTheme()`, `withTheme()`, `withThemeSync()` for theme management
- `createTheme()`, `extendTheme()`, `resolveColor()` helper functions
- `onThemeChange()` event listener for theme reactivity
- `link()` function for themed terminal hyperlinks in `@socketsecurity/lib/links`
- Logger and spinner now inherit theme colors automatically
- Spinner methods: `enableShimmer()`, `disableShimmer()`, `setShimmer()`, `updateShimmer()`
- DLX cross-platform binary resolution (`.cmd`, `.bat`, `.ps1` on Windows)
- DLX programmatic options aligned with CLI conventions (`force`, `quiet`, `package`)

### Changed

- Theme context uses AsyncLocalStorage instead of manual stack management
- Promise retry options renamed: `factor` → `backoffFactor`, `minTimeout` → `baseDelayMs`, `maxTimeout` → `maxDelayMs`

### Removed

**BREAKING CHANGES:**

- `pushTheme()` and `popTheme()` - use `withTheme()` or `withThemeSync()` instead
- `logger` export - use `getDefaultLogger()` instead
- `spinner` export - use `getDefaultSpinner()` instead
- `download-lock.ts` - use `process-lock.ts` instead
- Promise option aliases: `factor`, `minTimeout`, `maxTimeout`

---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.10.3](https://github.com/SocketDev/socket-lib/releases/tag/v2.10.3) - 2025-10-31

### Fixed

- Updated `@socketregistry/packageurl-js` to 1.3.1 to resolve an unintended external dependency
- **Documentation**: Corrected JSDoc `@example` import paths from `@socketsecurity/registry` to `@socketsecurity/lib` across utility modules
  - Updated examples in `memoization.ts`, `performance.ts`, `spinner.ts`, `suppress-warnings.ts`, and `tables.ts`
  - Ensures documentation reflects correct package name after v1.0.0 rename

## [2.10.2](https://github.com/SocketDev/socket-lib/releases/tag/v2.10.2) - 2025-10-31

### Changed

- **Package spec parsing**: Refactored to use official `npm-package-arg` library for robust handling of all npm package specification formats (versions, ranges, tags, git URLs)
  - Improves reliability when parsing complex package specs
  - Better handles edge cases in version ranges and scoped packages
  - Falls back to simple parsing if npm-package-arg fails

### Fixed

- **Scoped package version parsing**: Fixed critical bug where parsePackageSpec was stripping the `@` prefix from scoped packages with versions
  - Example: `@coana-tech/cli@~14.12.51` was incorrectly parsed as `coana-tech/cli@~14.12.51`
  - Caused package installation failures for scoped packages in DLX system

## [2.10.1](https://github.com/SocketDev/socket-lib/releases/tag/v2.10.1) - 2025-10-31

### Fixed

- **Process lock directory creation**: Use recursive mkdir to ensure parent directories exist when creating lock directory
- **Node.js debug flags**: Remove buggy `getNodeDebugFlags()` function that returned debug flags without required argument values

## [2.10.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.10.0) - 2025-10-30

### Added

- **Unified DLX metadata schema**: Standardized `.dlx-metadata.json` format across TypeScript and C++ implementations
  - Exported `DlxMetadata` interface as canonical schema reference
  - Core fields: `version`, `cache_key`, `timestamp`, `checksum`, `checksum_algorithm`, `platform`, `arch`, `size`, `source`
  - Support for `source` tracking (download vs decompression origin)
  - Reserved `extra` field for implementation-specific data
  - Comprehensive documentation with examples for both download and decompression use cases

### Changed

- **DLX binary metadata structure**: Updated `writeBinaryCacheMetadata()` to use unified schema with additional fields
  - Now includes `cache_key` (first 16 chars of SHA-512 hash)
  - Added `size` field for cached binary size
  - Added `checksum_algorithm` field (currently "sha256")
  - Restructured to use `source.type` and `source.url` for origin tracking
  - Maintains backward compatibility in `listDlxCache()` reader

## [2.9.1](https://github.com/SocketDev/socket-lib/releases/tag/v2.9.1) - 2025-10-30

### Added

- **Smart binary detection in dlxPackage**: Automatically finds the correct binary even when package name doesn't match binary name
  - If package has single binary, uses it automatically regardless of name
  - Resolves packages like `@socketsecurity/cli` (binary: `socket`) without manual configuration
  - Falls back to intelligent name matching for multi-binary packages
- **Optional binaryName parameter**: Added `binaryName` option to `DlxPackageOptions` for explicit binary selection when auto-detection isn't sufficient

### Fixed

- **Binary resolution for scoped packages**: Fixed issue where `dlxPackage` couldn't find binaries when package name didn't match binary name (e.g., `@socketsecurity/cli` with `bin: { socket: '...' }`)

## [2.9.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.9.0) - 2025-10-30

### Added

- **Socket.dev URL constants**: Added centralized URL constants for Socket.dev services
  - `SOCKET_WEBSITE_URL`: Main Socket.dev website
  - `SOCKET_CONTACT_URL`: Contact page
  - `SOCKET_DASHBOARD_URL`: Dashboard homepage
  - `SOCKET_API_TOKENS_URL`: API tokens settings page
  - `SOCKET_PRICING_URL`: Pricing information
  - `SOCKET_STATUS_URL`: Service status page
  - `SOCKET_DOCS_URL`: Documentation site
  - Available via `@socketsecurity/lib/constants/socket`

### Changed

- **Enhanced error messages across library**: Comprehensive audit and improvement of error handling
  - Added actionable error messages with resolution steps throughout modules
  - Improved file system operation errors (permissions, read-only filesystems, path issues)
  - Enhanced DLX error messages with clear troubleshooting guidance
  - Better error context in process locking, binary downloads, and package operations
  - Consistent error formatting with helpful user guidance
- **Consolidated process locking**: Standardized on directory-based lock format across all modules
  - All locking operations now use `process-lock` module exclusively
  - Lock directories provide atomic guarantees across all filesystems including NFS
  - Consistent mtime-based stale detection with 5-second timeout (aligned with npm npx)
  - Automatic cleanup on process exit with proper signal handling

## [2.8.4](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.4) - 2025-10-30

### Added

- **DLX binary helper functions mirror dlx-package pattern**
  - `downloadBinary`: Download binary with caching (without execution)
  - `executeBinary`: Execute cached binary without re-downloading
  - Renamed internal `downloadBinary` to `downloadBinaryFile` to avoid naming conflicts
  - Maintains feature parity with `downloadPackage`/`executePackage` from dlx-package

## [2.8.3](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.3) - 2025-10-30

### Fixed

- **Logger now fully defers all console access for Node.js internal bootstrap compatibility**: Completed lazy initialization to prevent ERR_CONSOLE_WRITABLE_STREAM errors
  - Deferred `Object.getOwnPropertySymbols(console)` call until first logger use
  - Deferred `kGroupIndentationWidth` symbol lookup
  - Deferred `Object.entries(console)` and prototype method initialization
  - Ensures logger can be safely imported in Node.js internal bootstrap contexts (e.g., `lib/internal/bootstrap/*.js`) before stdout is initialized
  - Builds on v2.8.2 console deferring to complete early bootstrap compatibility

## [2.8.2](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.2) - 2025-10-29

### Changed

- Enhanced Logger class to defer Console creation until first use
  - Eliminates early bootstrap errors when importing logger before stdout is ready
  - Enables safe logger imports during Node.js early initialization phase
  - Simplified internal storage with WeakMap-only pattern for constructor args

## [2.8.1](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.1) - 2025-10-29

### Changed

- **Consolidated DLX cache key generation**: Extracted `generateCacheKey` function to shared `dlx.ts` module
  - Eliminates code duplication between `dlx-binary.ts` and `dlx-package.ts`
  - Enables consistent cache key generation across the Socket ecosystem
  - Exports function for use in dependent packages (e.g., socket-cli)
  - Maintains SHA-512 truncated to 16 chars strategy from v2.8.0

## [2.8.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.0) - 2025-10-29

### Changed

- **Enhanced DLX cache key generation with npm/npx compatibility**: Updated cache key strategy to align with npm/npx ecosystem patterns
  - Changed from SHA-256 (64 chars) to SHA-512 truncated to 16 chars (matching npm/npx)
  - Optimized for Windows MAX_PATH compatibility (260 character limit)
  - Accepts collision risk for shorter paths (~1 in 18 quintillion with 1000 entries)
  - Added support for PURL-style package specifications (e.g., `npm:prettier@3.0.0`, `pypi:requests@2.31.0`)
  - Documented Socket's shorthand format (without `pkg:` prefix) handled by `@socketregistry/packageurl-js`
  - References npm/cli v11.6.2 implementation for consistency

## [2.7.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.7.0) - 2025-10-28

### Added

- **DLX cache locking for concurrent installation protection**: Added process-lock protection to dlx-package installation operations
  - Lock file created at `~/.socket/_dlx/<hash>/.lock` (similar to npm npx's `concurrency.lock`)
  - Prevents concurrent installations from corrupting the same package cache
  - Uses 5-second stale timeout and 2-second periodic touching (aligned with npm npx)
  - Double-check pattern verifies installation after acquiring lock to avoid redundant work
  - Completes 100% alignment with npm's npx locking strategy

## [2.6.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.6.0) - 2025-10-28

### Changed

- **Process locking aligned with npm npx**: Enhanced process-lock module to match npm's npx locking strategy
  - Reduced stale timeout from 10 seconds to 5 seconds (matches npm npx)
  - Added periodic lock touching (2-second interval) to prevent false stale detection during long operations
  - Implemented second-level granularity for mtime comparison to avoid APFS floating-point precision issues
  - Added automatic touch timer cleanup on process exit
  - Timers use `unref()` to prevent keeping process alive
  - Aligns with npm's npx implementation per https://github.com/npm/cli/pull/8512

## [2.5.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.5.0) - 2025-10-28

### Added

- **Process locking utilities**: Added `ProcessLockManager` class providing cross-platform inter-process synchronization using file-system based locks
  - Atomic lock acquisition via `mkdir()` for thread-safe operations
  - Stale lock detection with automatic cleanup (default 10 seconds, aligned with npm's npx strategy)
  - Exponential backoff with jitter for retry attempts
  - Process exit handlers for guaranteed cleanup even on abnormal termination
  - Three main APIs: `acquire()`, `release()`, and `withLock()` (recommended)
  - Comprehensive test suite with `describe.sequential` for proper isolation
  - Export: `@socketsecurity/lib/process-lock`

### Changed

- **Script refactoring**: Renamed `spinner.succeed()` to `spinner.success()` for consistency
- **Script cleanup**: Removed redundant spinner cleanup in interactive-runner

## [2.4.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.4.0) - 2025-10-28

### Changed

- **Download locking aligned with npm**: Reduced default `staleTimeout` in `downloadWithLock()` from 300 seconds to 10 seconds to align with npm's npx locking strategy
  - Prevents stale locks from blocking downloads for extended periods
  - Matches npm's battle-tested timeout range (5-10 seconds)
  - Binary downloads now protected against concurrent corruption
- **Binary download protection**: `dlxBinary.downloadBinary()` now uses `downloadWithLock()` to prevent corruption when multiple processes download the same binary concurrently
  - Eliminates race conditions during parallel binary downloads
  - Maintains checksum verification and executable permissions

## [2.3.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.3.0) - 2025-10-28

### Added

- **Binary utility wrapper functions**: Added `which()` and `whichSync()` wrapper functions to `bin` module
  - Cross-platform binary lookup that respects PATH environment variable
  - Synchronous and asynchronous variants for different use cases
  - Integrates with existing binary resolution utilities

## [2.2.1](https://github.com/SocketDev/socket-lib/releases/tag/v2.2.1) - 2025-10-28

### Fixed

- **Logger write() method**: Fixed `write()` to bypass Console formatting when outputting raw text
  - Previously, `write()` used Console's internal `_stdout` stream which applied unintended formatting like group indentation
  - Now stores a reference to the original stdout stream in a dedicated private field (`#originalStdout`) during construction
  - The `write()` method uses this stored reference to write directly to the raw stream, bypassing all Console formatting layers
  - Ensures raw text output without any formatting applied, fixing test failures in CI environments where writes after `indent()` were unexpectedly formatted

## [2.2.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.2.0) - 2025-10-28

### Added

- **Logger step symbol**: `logger.step()` now displays a cyan arrow symbol (→ or > in ASCII) before step messages for improved visual separation
  - New `LOG_SYMBOLS.step` symbol added to the symbol palette
  - Automatic stripping of existing symbols from step messages
  - Maintains existing blank line behavior for clear step separation

## [2.1.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.1.0) - 2025-10-28

### Added

- Package manager detection utilities (`detectPackageManager()`, `getPackageManagerInfo()`, `getPackageManagerUserAgent()`)
- `isInSocketDlx()` utility to check if file path is within `~/.socket/_dlx/`
- `downloadPackage()` and `executePackage()` functions for separate download and execution of packages

## [2.0.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.0.0) - 2025-10-27

### Breaking Changes

**Environment Variable System Refactor**

This release completely refactors the environment variable system, consolidating 60+ individual env constant files into grouped getter modules with AsyncLocalStorage-based test rewiring.

**Consolidated env files** - Individual files replaced with grouped modules:

- `env/github.ts` - All GitHub-related env vars (GITHUB_TOKEN, GH_TOKEN, GITHUB_API_URL, etc.)
- `env/socket.ts` - Socket-specific env vars (SOCKET_API_TOKEN, SOCKET_CACACHE_DIR, etc.)
- `env/socket-cli.ts` - Socket CLI env vars (SOCKET_CLI_API_TOKEN, SOCKET_CLI_CONFIG, etc.)
- `env/npm.ts` - NPM-related env vars
- `env/locale.ts` - Locale env vars (LANG, LC_ALL, LC_MESSAGES)
- `env/windows.ts` - Windows-specific env vars (USERPROFILE, LOCALAPPDATA, APPDATA, COMSPEC)
- `env/xdg.ts` - XDG base directory env vars
- `env/temp-dir.ts` - Temp directory env vars (TEMP, TMP, TMPDIR)
- `env/test.ts` - Test framework env vars (VITEST, JEST_WORKER_ID)

**Constants → Getter functions** - All env constants converted to functions:

```typescript
// Before (v1.x):
import { GITHUB_TOKEN } from '#env/github-token'

// After (v2.x):
import { getGithubToken } from '#env/github'
```

**Deleted files** - Removed 60+ individual env constant files:

- `env/github-token.ts`, `env/socket-api-token.ts`, etc. → Consolidated into grouped files
- `env/getters.ts` → Functions moved to their respective grouped files

### Added

**AsyncLocalStorage-Based Test Rewiring**

New `env/rewire.ts` and `path/rewire.ts` modules provides context-isolated environment variable overrides for testing:

```typescript
import { withEnv, setEnv, resetEnv, getEnvValue } from '#env/rewire'

// Option 1: Isolated context with AsyncLocalStorage
await withEnv({ CI: '1', NODE_ENV: 'test' }, async () => {
  // CI env var is '1' only within this block
  // Concurrent tests don't interfere
})

// Option 2: Traditional beforeEach/afterEach pattern
beforeEach(() => {
  setEnv('CI', '1')
})

afterEach(() => {
  resetEnv()
})
```

**Features:**

- Allows toggling between snapshot and live behavior
- Compatible with `vi.stubEnv()` as fallback

### Changed

- Updated all dynamic `require()` statements to use path aliases (`#constants/*`, `#packages/*`)
- Improved logger blank line tracking per stream (separate stderr/stdout tracking)
- Exported `getCacache()` function for external use

## [1.3.6](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.6) - 2025-10-26

### Fixed

- Fixed `debug` module functions being incorrectly tree-shaken as no-ops in bundled output
  - Removed incorrect `/*@__NO_SIDE_EFFECTS__*/` annotations from `debug()`, `debugDir()`, `debugLog()`, and their `*Ns` variants
  - These functions have side effects (logging output, spinner manipulation) and should not be removed by bundlers
  - Fixes issue where `debugLog()` and `debugDir()` were compiled to empty no-op functions

## [1.3.5](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.5) - 2025-10-26

### Added

- Added `createEnvProxy()` utility function to `env` module for Windows-compatible environment variable access
  - Provides case-insensitive environment variable access (e.g., PATH, Path, path all work)
  - Smart priority system: overrides > exact match > case-insensitive fallback
  - Full Proxy implementation with proper handlers for get, set, has, ownKeys, getOwnPropertyDescriptor
  - Opt-in helper for users who need Windows env var compatibility
  - Well-documented with usage examples and performance notes
- Added `findCaseInsensitiveEnvKey()` utility function to `env` module
  - Searches for environment variable keys using case-insensitive matching
  - Optimized with length fast path to minimize expensive `toUpperCase()` calls
  - Useful for cross-platform env var access where case may vary (e.g., PATH vs Path vs path)
- Added comprehensive test suite for `env` module with 71 tests
  - Covers `envAsBoolean()`, `envAsNumber()`, `envAsString()` conversion utilities
  - Tests `createEnvProxy()` with Windows environment variables and edge cases
  - Validates `findCaseInsensitiveEnvKey()` optimization and behavior

### Fixed

- Fixed `spawn` module to preserve Windows `process.env` Proxy behavior
  - When no custom environment variables are provided, use `process.env` directly instead of spreading it
  - Preserves Windows case-insensitive environment variable access (PATH vs Path)
  - Fixes empty CLI output issue on Windows CI runners
  - Only spreads `process.env` when merging custom environment variables

## [1.3.4](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.4) - 2025-10-26

### Added

- Added Node.js SIGUSR1 signal handler prevention utilities in `constants/node` module
  - `supportsNodeDisableSigusr1Flag()`: Detects if Node supports `--disable-sigusr1` flag (v22.14+, v23.7+, v24.8+)
  - `getNodeDisableSigusr1Flags()`: Returns appropriate flags to prevent debugger attachment
    - Returns `['--disable-sigusr1']` on supported versions (prevents Signal I/O Thread creation)
    - Falls back to `['--no-inspect']` on Node 18+ (blocks debugger but still creates thread)
  - Enables production CLI environments to prevent SIGUSR1 debugger signal handling for security

## [1.3.3](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.3) - 2025-10-24

### Fixed

- Fixed lazy getter bug in `objects` module where `defineGetter`, `defineLazyGetter`, and `defineLazyGetters` had incorrect `/*@__NO_SIDE_EFFECTS__*/` annotations
  - These functions mutate objects by defining properties, so marking them as side-effect-free caused esbuild to incorrectly tree-shake the calls during bundling
  - Lazy getters were returning `undefined` instead of their computed values
  - Removed double wrapping in `defineLazyGetters` where `createLazyGetter` was being called unnecessarily

## [1.3.2](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.2) - 2025-10-24

### Fixed

- Continued fixing of broken external dependency bundling

## [1.3.1](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.1) - 2025-10-24

### Fixed

- Fixed @inquirer modules (`input`, `password`, `search`) not being properly bundled into `dist/external/`
  - Resolves build failures in downstream packages (socket-cli) that depend on socket-lib
  - Added missing packages to bundling configuration in `scripts/build-externals.mjs`
  - All @inquirer packages now ship as zero-dependency bundles

### Added

- Added tests to prevent rogue external stubs in `dist/external/`
  - Detects stub re-export patterns that indicate incomplete bundling
  - Verifies all @inquirer modules are properly bundled (> 1KB)
  - Catches bundling regressions early in CI pipeline

## [1.3.0](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.0) - 2025-10-23

### Added

- Added `validateFiles()` utility function to `fs` module for defensive file access validation
  - Returns `ValidateFilesResult` with `validPaths` and `invalidPaths` arrays
  - Filters out unreadable files before processing (common with Yarn Berry PnP virtual filesystem, pnpm symlinks)
  - Prevents ENOENT errors when files exist in glob results but are not accessible
  - Comprehensive test coverage for all validation scenarios

## [1.2.0](https://github.com/SocketDev/socket-lib/releases/tag/v1.2.0) - 2025-10-23

### Added

- Added `dlx-package` module for installing and executing npm packages directly
  - Content-addressed caching using SHA256 hash (like npm's \_npx)
  - Auto-force for version ranges (^, ~, >, <) to get latest within range
  - Cross-platform support with comprehensive tests (30 tests)
  - Parses scoped and unscoped package specs correctly
  - Resolves binaries from package.json bin field

### Changed

- Unified DLX storage under `~/.socket/_dlx/` directory
  - Binary downloads now use `~/.socket/_dlx/` instead of non-existent cache path
  - Both npm packages and binaries share parent directory with content-addressed hashing
- Updated paths.ts documentation to clarify unified directory structure

## [1.1.2] - 2025-10-23

### Fixed

- Fixed broken relative import paths in `packages/isolation.ts` and `packages/provenance.ts` that prevented bundling by external tools

## [1.1.1] - 2025-10-23

### Fixed

- Fixed shimmer text effects not respecting CI environment detection (now disabled in CI to prevent ANSI escape codes in logs)

## [1.1.0] - 2025-10-23

### Added

- Added `filterOutput` option to `stdio/mask` for filtering output chunks before display/buffering
- Added `overrideExitCode` option to `stdio/mask` for customizing exit codes based on captured output
- Added comprehensive JSDoc documentation across entire library for enhanced VSCode IntelliSense
  - Detailed @param, @returns, @template, @throws tags
  - Practical @example blocks with real-world usage patterns
  - @default tags showing default values
  - Enhanced interface property documentation

### Changed

- Improved TypeScript type hints and tooltips throughout library
- Enhanced documentation for all core utilities (arrays, fs, git, github, http-request, json, logger, objects, path, promises, spawn, spinner, strings)
- Enhanced documentation for stdio utilities (clear, divider, footer, header, mask, progress, prompts, stderr, stdout)
- Enhanced documentation for validation utilities (json-parser, types)

## [1.0.5] - 2025-10-22

### Added

- Added support for custom retry delays from onRetry callback

## [1.0.4] - 2025-10-21

### Fixed

- Fixed external dependency paths in root-level source files (corrected require paths from `../external/` to `./external/` in bin, cacache, fs, globs, spawn, spinner, and streams modules)

## [1.0.3] - 2025-10-21

### Fixed

- Fixed external dependency import paths in packages and stdio modules (corrected require paths from `../../external/` to `../external/`)

## [1.0.2] - 2025-10-21

### Fixed

- Fixed module resolution error in packages/normalize module (corrected require path from `../../constants/socket` to `../constants/socket`)

## [1.0.1] - 2025-10-21

### Fixed

- Fixed relative import paths in compiled CommonJS output (changed `require("../external/...")` to `require("./external/...")` for root-level dist files)

## [1.0.0] - 2025-10-20

### Changed

- Consolidated parseArgs into argv/parse module

---

**Historical Entries**: The entries below are from when this package was named `@socketsecurity/registry`. This package was renamed to `@socketsecurity/lib` starting with version 1.0.0.

---

## [1.5.3] - 2025-10-07

### Added

- Fix bad build and add validation to prevent in future

## [1.5.2] - 2025-10-07

### Added

- Added coverage utilities to parse v8 and type coverage reports

### Fixed

- Fixed `isPath` function to exclude URLs with protocols
- Fixed `isolatePackage` to handle file: URLs and npm-package-arg paths correctly

## [1.5.1] - 2025-10-05

### Added

- Added `isolatePackage` to `lib/packages/isolation` for creating isolated package test environments

### Changed

- Removed `dependencies/index` barrel file to prevent eager loading of all dependency modules

## [1.5.0] - 2025-10-05

### Added

- Added support for testing local development packages in addition to socket-registry packages
- Exposed isolation module as part of public API via `lib/packages`

### Changed

- Renamed `setupPackageTest` to `isolatePackage` for clearer intent
- Refactored `installPackageForTesting` to accept explicit `sourcePath` and `packageName` parameters
- Simplified package installation logic by removing path detection from low-level function
- Consolidated `setupPackageTest` and `setupMultiEntryTest` into single `isolatePackage` function with options

## [1.4.6] - 2025-10-05

### Added

- Added comprehensive package.json exports validation tests

## [1.4.5] - 2025-10-05

### Added

- Added performance monitoring utilities with timer, measurement, and reporting functions
- Added memoization utilities with LRU, TTL, weak references, and promise deduplication support
- Added table formatting utilities (`formatTable`, `formatSimpleTable`) for CLI output
- Added progress tracking to spinner with `updateProgress()` and `incrementProgress()` methods
- Added `isDir` and `safeStats` async helpers to fs module

### Changed

- Removed `platform` and `arch` options from `dlxBinary` function as cross-platform binary execution is not supported

### Fixed

- Fixed Windows shell execution in `dlxBinary` by adding cache directory to PATH

## [1.4.4] - 2025-10-05

### Fixed

- Fixed subpath exports

## [1.4.3] - 2025-10-04

### Added

- Spinner lifecycle utilities (`withSpinner`, `withSpinnerRestore`, `withSpinnerSync`) for automatic spinner cleanup with try/finally blocks

## [1.4.2] - 2025-10-04

### Added

- Added `GITHUB_API_BASE_URL` constant for GitHub API endpoint configuration
- Added `SOCKET_API_BASE_URL` constant for Socket API endpoint configuration
- Added generic TTL cache utility (`createTtlCache`) with in-memory memoization and persistent storage support

### Changed

- Refactored GitHub caching to use the new `cache-with-ttl` utility for better performance and consistency

## [1.4.1] - 2025-10-04

### Changed

- Update maintained Node.js versions of `constants.maintainedNodeVersions`

## [1.4.0] - 2025-10-04

### Added

- Added `PromiseQueue` utility for controlled concurrency operations
- Added lazy dependency loaders and test utilities
- Added HTTP utilities with retry logic and download locking
- Added `.claude` directory for scratch documents
- Added `noUnusedLocals` and `noUnusedParameters` to TypeScript config

### Changed

- Refactored all library functions to use options objects for better API consistency
  - `lib/strings.ts` - String manipulation functions
  - `lib/url.ts` - URL handling functions
  - `lib/words.ts` - Word manipulation functions
- Refactored `lib/packages` module into specialized submodules for improved code organization
  - `lib/packages/editable.ts` - Package editing functionality
  - `lib/packages/exports.ts` - Export resolution utilities
  - `lib/packages/licenses.ts` - License handling and validation
  - `lib/packages/manifest.ts` - Manifest data operations
  - `lib/packages/normalize.ts` - Path normalization utilities
  - `lib/packages/operations.ts` - Package installation and modification operations
  - `lib/packages/paths.ts` - Package path utilities
  - `lib/packages/provenance.ts` - Package provenance verification
  - `lib/packages/specs.ts` - Package spec parsing
  - `lib/packages/validation.ts` - Package validation utilities
- Moved configuration files (vitest, eslint, knip, oxlint, taze) to `.config` directory
- Replaced `fetch()` with Node.js native `http`/`https` modules for better reliability
- Replaced `any` types with meaningful types across library utilities
- Improved pnpm security with build script allowlist
- Updated vitest coverage thresholds to 80%
- Consolidated test files to reduce duplication
- Note: Public API remains unchanged; these are internal organizational improvements

### Fixed

- Fixed resource leaks and race conditions in socket-registry
- Fixed `yarn-cache-path` constant to return string type consistently
- Fixed Yarn Windows temp path detection in `shouldSkipShadow`
- Fixed path normalization for Windows compatibility across all path utilities
- Fixed cache path tests for Windows case sensitivity
- Fixed type errors in promises, parse-args, logger, and specs tests
- Fixed GitHub tests to mock `httpRequest` correctly
- Fixed SEA build tests to mock `httpRequest`
- Decoded URL percent-encoding in `pathLikeToString` fallback

## [1.3.10] - 2025-10-03

### Added

- New utility modules for DLX, shadow, SEA, cacache, and versions functionality
- getSocketHomePath alias to paths module
- del dependency and external wrapper for safer file deletion
- @fileoverview tags to lib modules
- camelCase expansion for kebab-case arguments in parseArgs
- Coerce and configuration options to parseArgs

### Changed

- Updated file removal to use del package for safer deletion
- Normalized path returns in fs and Socket directory utilities
- Removed default exports from git and parse-args modules
- Enhanced test coverage across multiple modules (parse-args, prompts, strings, env, spawn, json)

## [1.3.9] - 2025-10-03

### Changed

- Internal build and distribution updates

## [1.3.8] - 2025-10-03

### Added

- Added unified directory structure for Socket ecosystem tools
- New path utilities module for cross-platform directory resolution
- Directory structure constants for Socket CLI, Registry, Firewall, and DLX

## [1.3.7] - 2025-10-02

### Changed

- Updated manifest.json entries

## [1.3.6] - 2025-10-01

### Fixed

- Fixed indent-string interoperability with older v1 and v2 versions

## [1.3.5] - 2025-10-01

### Added

- Added lib/git utilities module

### Fixed

- Fixed invalid manifest entries
- Fixed parseArgs strip-aliased bug

## [1.3.4] - 2025-10-01

### Changed

- Updated various package override versions

## [1.3.3] - 2025-10-01

### Fixed

- Fixed normalizePath collapsing multiple leading `..` segments incorrectly

## [1.3.2] - 2025-10-01

### Added

- Added 'sfw' to isBlessedPackageName method check
- Added ENV.DEBUG normalization for debug package compatibility
  - `DEBUG='1'` or `DEBUG='true'` automatically expands to `DEBUG='*'` (enables all namespaces)
  - `DEBUG='0'` or `DEBUG='false'` automatically converts to empty string (disables all output)
  - Namespace patterns like `DEBUG='app:*'` are preserved unchanged

## [1.3.1] - 2025-09-30

### Changed

- Renamed debug functions from *Complex to *Ns

### Fixed

- Fixed regression with lib/prompts module imports

## [1.3.0] - 2025-09-29

### Changed

- Updated registry subpath exports

### Fixed

- Fixed Node.js built-in module imports in CommonJS output

## [1.2.2] - 2025-09-29

### Changed

- Internal improvements to module structure

## [1.2.1] - 2025-09-29

### Changed

- Restructured constants module with new architecture
- Updated build configuration and package exports
