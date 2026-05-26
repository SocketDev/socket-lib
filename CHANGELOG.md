# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.0.2](https://github.com/SocketDev/socket-lib/releases/tag/v6.0.2) - 2026-05-25

### Added

- **`./http-request` top-level export.** New canonical entry for the Node-side HTTP surface (`httpJson`, `httpText`, `httpRequest`, `HttpResponseError`). Symmetric with `./http-request/browser` so `import { httpJson } from '@socketsecurity/lib/http-request'` works on both platforms — bundlers that honor the `'browser'` export condition pick the browser variant automatically.

### Changed (breaking)

- **`./logger/default` → `./logger/node`.** The Node-side logger leaf is renamed to pair with `./logger/browser`. The canonical `./logger` path is unchanged; consumers importing the explicit `./logger/default` subpath update to `./logger/node`.
- **`./http-request/convenience` removed.** Its exports (`httpJson`, `httpText`) move to the new `./http-request/node` leaf, which also re-exports `httpRequest` and `HttpResponseError`. Most consumers should import from `./http-request` (auto-routing) rather than the explicit leaf.

### Fixed

- **`./logger` auto-resolves to `./logger/browser` on browser platforms.** 6.0.1 announced this but shipped without the `'browser'` condition on the `./logger` entry, so bundlers fell through to the Node default and pulled in `node:*` builtins.

## [6.0.1](https://github.com/SocketDev/socket-lib/releases/tag/v6.0.1) - 2026-05-25

Five additive features plus public-surface polish on top of 6.0.0. The path renames drop doubled-name leaves (`spawn/spawn`, `ttl-cache/cache`, `globs/glob`, `links/link`, `promise-queue/queue`) and regroup three top-level directories whose contents were the same concept (process events) under a new `events/` umbrella. Renames are path-only; no symbol renames or behavior changes.

### Added

- **`colors/socket-palette`** — Socket-branded 24-bit ANSI palette. Three themes (`'light' | 'dark' | 'synthwave'`) expose status colors (`success` / `warning` / `alert` / `error` / `info`) plus the Socket brand constants (`socketPurple` `#8c50ff`, `socketPink` `#ff00aa`). Each helper emits `\x1b[38;2;R;G;Bm` directly rather than rounding to the legacy 8-color palette, so truecolor terminals render the brand hex byte-for-byte. Hex values exposed via `palette.hex.*` for callers building their own escapes. Default theme is `'dark'`.
- **`logger/browser`** — minimal `console`-backed `Logger` mirroring the public `success` / `fail` / `warn` / `error` / `info` / `log` surface, with no `node:process` / `node:console` / `node:os` imports. Usable from Chrome MV3 service workers, content scripts, and popups. Importing `@socketsecurity/lib/logger` in a bundler that resolves the `'browser'` export condition (rolldown, vite, esbuild) automatically picks up this shim; Node consumers continue to get the full `Logger` class.
- **`'browser'` export condition** on 40 leaf modules. 35 zero-Node leaf utilities (`arrays`, `colors`, `errors`, `objects`, `regexps`, `strings`, `url`, `versions`, `words` families) carry a `'browser'` condition signalling browser-safety to bundlers. Five leaves with dedicated browser implementations (`logger/browser`, `http-request/browser`, `http-request/browser-fetch`) route to the alternate file. Browser-incompatible modules (`fs`, `archives`, `bin`, subprocess / TTY / OS-secrets surfaces) deliberately omit the condition. Full compatibility matrix in [`docs/browser-compatibility.md`](./docs/browser-compatibility.md).
- **`http-request` `signal` option (Node-side parity).** `HttpRequestOptions.signal?: AbortSignal | undefined` is now plumbed through `request-attempt` → `httpModule.request()`. An aborted signal short-circuits the retry loop (caller cancel is not retryable). Brings the Node side to parity with the browser side, which already exposes `signal` via `AbortController` on `fetch()`.
- **Default-on read-result cache for `fs/read-json` `readJson` / `readJsonSync`.** Process-scoped LRU cache keyed on `path + ino + size + mtimeMs`. Safe by four guards: stat-validated keys (re-read on stat mismatch), defensive clone on both insert and hit (caller mutations can't poison the entry), reviver opt-out (function identity isn't safely hashable), and per-call `cache: false` escape hatch. Cap defaults to 256 entries (env `SOCKET_LIB_READ_JSON_CACHE_MAX` or `setReadJsonCacheMax()`); TTL defaults to 5 min (env `SOCKET_LIB_READ_JSON_CACHE_TTL_MS` or `setReadJsonCacheTtlMs()`; set to `0` to disable TTL). `clearReadJsonCache()` + `getReadJsonCacheStats()` exported for tests and long-running daemons.
- **`argv/parse-args-string`** — `parseArgsString(cmd)` tokenizes a shell-style command string into an argv array. Recognizes bare tokens, single + double quoted tokens, and mixed `key="value"` tokens. Use for turning a string representation of a command (from config, a `bin` field, a test fixture) into argv that `child_process.spawn` / `execFileSync` accepts directly, bypassing platform shell quoting differences (`cmd.exe` vs `bash`).

### Changed (breaking)

- **`spawn/*` → `process/spawn/*`.** Directory moved under `process/` (which already housed `process/abort`); the function leaf renames from `spawn/spawn` to `process/spawn/child` (the spawned child is what `spawn()` returns). Sibling files keep their names: `process/spawn/{errors,stdio,types,_internal}`.
- **`signal-exit/*` → `events/exit/*`.** Directory merged into a new `events/` umbrella. Entry leaf renames from `signal-exit/register` to `events/exit/handler`. Sibling files unchanged: `events/exit/{intercept,lifecycle,signals,types,_internal}`.
- **`warnings/*` → `events/warning/*`.** Sibling of `events/exit/` under the new `events/` umbrella. Entry leaf renames from `warnings/event-target` to `events/warning/handler`; `warnings/suppress` becomes `events/warning/suppress`.
- **`ttl-cache/*` → `cache/ttl/*`.** Directory renamed; entry leaf renames from `ttl-cache/cache` to `cache/ttl/store`. `ttl-cache/types` becomes `cache/ttl/types`.
- **`promise-queue/*` folded into existing `promises/`.** `promise-queue/queue` becomes `promises/queue`; `promise-queue/types` merges into the existing `promises/types`.
- **`spinner/registry` → `spinner/default`.** Matches the `getDefaultSpinner()` naming pattern — the leaf is "the default spinner", not "the registry of spinners".
- **`logger/logger` → `logger/default`.** Matches the `getDefaultLogger()` naming pattern; drops the doubled segment.
- **`globs/glob` → `globs/match`.** Drops the doubled segment; `match` describes what the function does (pattern-match files), not what type the file is.
- **`links/link` → `links/create`.** Drops the doubled segment; `create` describes the verb (`createSymlink`).
- **`exports` map refreshed** for all renamed/moved leaves. The `./promises/types` entry stays unchanged — `promise-queue/types` content was folded into it.

### Removed (breaking)

- **Top-level directories `spawn/`, `signal-exit/`, `warnings/`, `ttl-cache/`, `promise-queue/`.** All five disappear in favor of the regrouped layouts above. No backcompat aliases.

### Migration

```diff
- import { spawn, spawnSync } from '@socketsecurity/lib/spawn/spawn'
- import { isSpawnError, SpawnError } from '@socketsecurity/lib/spawn/errors'
- import type { SpawnOptions } from '@socketsecurity/lib/spawn/types'
+ import {
+   spawn,
+   spawnSync,
+   isSpawnError,
+   SpawnError,
+ } from '@socketsecurity/lib/process/spawn/child'
+ import type { SpawnOptions } from '@socketsecurity/lib/process/spawn/types'

- import { onExit } from '@socketsecurity/lib/signal-exit/register'
+ import { onExit } from '@socketsecurity/lib/events/exit/handler'

- import { suppressDeprecationWarnings } from '@socketsecurity/lib/warnings/suppress'
+ import { suppressDeprecationWarnings } from '@socketsecurity/lib/events/warning/suppress'

- import { createTtlCache, TtlCache } from '@socketsecurity/lib/ttl-cache/cache'
+ import { createTtlCache, TtlCache } from '@socketsecurity/lib/cache/ttl/store'

- import { getDefaultSpinner } from '@socketsecurity/lib/spinner/registry'
+ import { getDefaultSpinner } from '@socketsecurity/lib/spinner/default'

- import { getDefaultLogger } from '@socketsecurity/lib/logger/logger'
+ import { getDefaultLogger } from '@socketsecurity/lib/logger/default'

- import { PromiseQueue } from '@socketsecurity/lib/promise-queue/queue'
+ import { PromiseQueue } from '@socketsecurity/lib/promises/queue'

- import { glob } from '@socketsecurity/lib/globs/glob'
+ import { glob } from '@socketsecurity/lib/globs/match'

- import { createSymlink } from '@socketsecurity/lib/links/link'
+ import { createSymlink } from '@socketsecurity/lib/links/create'
```

No symbol names changed. No behavior changes.

## [6.0.0](https://github.com/SocketDev/socket-lib/releases/tag/v6.0.0) - 2026-05-20

Public-surface reshape. All top-level barrels are gone; import from named leaf subpaths instead. `@socketsecurity/lib/logger` and `@socketsecurity/lib/errors` stay as aliases.

### Removed (breaking)

- **All top-level barrel modules.** Replace with leaf subpaths — e.g. `fs` → `fs/safe`, `http-request` → `http-request/convenience`, `packages` → `packages/operations`, `versions` → `versions/compare`. Affects `fs`, `http-request`, `spinner`, `git`, `github`, `spawn`, `bin`, `primordials`, `objects`, `strings`, `promises`, `arrays`, `url`, `packages`, `cacache`, `signal-exit`, `compression`, `archives`, `globs`, `regexps`, `ssri`, `colors`, `ansi`, `crypto`, `abort`, `streams`, `links`, `shadow`, `ipc`, `ipc-cli`, `errors`, `words`, `tables`, `sorts`, `env`, `debug`, `versions`, `types`.
- **`agent` removed.** Per-tool helpers under `eco/npm/<tool>/{exec,flags}` (`bun`, `npm`, `pnpm`, `vlt`, `yarnpkg/yarn`).
- **`types/` removed.** Schema types under `eco/purl` and `eco/types`.
- **Subdir renames.** `memoization/` → `memo/`, `performance/` → `perf/`, `suppress-warnings/` → `warnings/`, `cache-with-ttl/` → `ttl-cache/`, `process-lock/` → `process/`, `package-extensions/` → `pkg-ext/`, `temporary-executor/` → `process/transient` (`isRunningInTemporaryExecutor` → `isTransientProcess`).
- **`SOCKET_LIB_USER_AGENT` + `SOCKET_LIB_URL` removed.** Use `getSocketCallerUserAgent()` from `http-request/user-agent` — see Added.

### Changed (breaking)

- **`versions` API renamed.** `compareVersions` → `compare`, `isEqual` → `eq` (+ new `neq`), `isLessThan(OrEqual)` → `lt`/`lte`, `isGreaterThan(OrEqual)` → `gt`/`gte`, `sortVersions` → `sort`, `sortVersionsDesc` → `rsort`. Runs through `node:smol-versions` when present, falls back to `semver`.
- **`dlx/manifest` `ManifestEntry` → `DlxManifestEntry`** (disambiguates from `eco/types` `ManifestEntry`).
- **`dlx/arborist getBaseArboristOptions`** second arg is now `{ quiet }` instead of positional `quiet: boolean`.
- **Predicates renamed for scope clarity** — cwd/process-scoped predicates now carry the scope in the name.
- **Default `User-Agent` header** now `socketsecurity-lib/<version> node/<node-version> <platform>/<arch>` (was `socketsecurity-lib/<version> (<url>)`).

### Added

- **`http-request/user-agent`** — `buildUserAgent({ name, version }, caller?)` for the canonical three-token UA, and `getSocketCallerUserAgent()` for the lib's own outbound requests. Set `SOCKET_CALLER_USER_AGENT` to append your own identifier to the lib UA (empty/whitespace is ignored).
- **`packages/operations#pkgNameToSlug(name)`** — `@scope/name` → `scope-name`, plain names unchanged.
- **`secrets/socket-api-token`** — `readSocketApiToken()` / `readSocketApiTokenSync()` resolve the Socket API token from keychain → `SOCKET_API_TOKEN` (canonical) → `SOCKET_API_KEY` (legacy). Pass `{ allowEnvOnly }` to skip keychain in headless contexts.
- **`ai/discover` + `ai/spawn`** — locked-down spawn helpers for Claude / Codex / Gemini / OpenCode CLIs. Type-level enforcement of the four lockdown flags (`tools`, `allowedTools`, `disallowedTools`, `permissionMode: 'dontAsk'`). Retries HTTP 529 / "Overloaded" with 5 s / 15 s / 45 s backoff.
- **`socket-lib check primordials --fix`** — applies suggested rewrites for `.socket-lib.json`-tracked drift.
- **9 new primordial exports** (305 total) — Array.prototype: `ToLocaleString`, `ToString`. String.prototype: `IsWellFormed` (ES2024), `ToString`, `ToWellFormed` (ES2024), `ValueOf`. Number.prototype: `ToExponential`, `ToPrecision`, `ValueOf`. `StringPrototypeIsWellFormed` routes through `node:smol-primordial` on the smol Node binary — ASCII strings short-circuit to `true` without an O(n) lone-surrogate scan.

### Fixed

- **pnpm v9 `isDev` derivation.** Snapshot entries were stuck at `depType: 'prod'` because v9 dropped the per-snapshot `dev` marker. Now derived per-package across all importer blocks; ties go to prod, matching pnpm's resolver.
- **yarn `dependenciesMeta` inversion.** A child's `optional: true` was flipping the parent's `isOptional`; flags now refer to the child as declared.
- **pnpm v9 phantom PackageRef.** Block-shape importer entries emitted a parent ref with `version: ''` before the indented `version:` was consumed.
- **pnpm v9 protocol filter.** `workspace:`, `file:`, and `link:` importer values are no longer surfaced as registry refs.
- **npm v1 alias extraction.** Aliased installs (`"alias": { "version": "npm:<real>@<ver>" }`) now surface the real `{ name, version }`; the alias key is preserved on `_index`.
- **npm v2/v3 workspace + alias name preference.** Path-keyed workspace entries and aliased installs honor the explicit `pkg.name` over the path-derived fallback.

### Migration

```diff
- import { safeDelete, readJson } from '@socketsecurity/lib/fs'
+ import { safeDelete } from '@socketsecurity/lib/fs/safe'
+ import { readJson } from '@socketsecurity/lib/fs/read-json'

- import { httpJson } from '@socketsecurity/lib/http-request'
+ import { httpJson } from '@socketsecurity/lib/http-request/convenience'

- import { compareVersions, isLessThan, sortVersions } from '@socketsecurity/lib/versions'
- compareVersions(a, b); isLessThan(a, b); sortVersions(arr)
+ import { compare, lt, sort } from '@socketsecurity/lib/versions/compare'
+ compare(a, b); lt(a, b); sort(arr)
```

## [5.28.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.28.0) - 2026-05-06

### Added

- **`compression` (new)** — brotli + gzip helpers with in-memory `Buffer`, file-to-file (with `{ inPlace: true }`), and stream-creator shapes. Detection (`isBrotliCompressed` / `isGzipCompressed` magic-byte sniffing), extension classification (`hasBrotliExt` / `hasGzipExt`), `BROTLI_EXTS` / `GZIP_EXTS` constants, `stripExt(path, exts)`, and `CompressOptions` / `CompressFileOptions` types.
- **`socket-lib` CLI** — `pnpm exec socket-lib <command>` dispatcher. First subcommand: `check primordials` (alias `check prim`) diffs source-destructured primordials against the lib's set. Reads `.socket-lib.json` (or `.config/socket-lib.json`). Flags: `--config`, `--explain`, `--json`, `--silent`, `--help`.
- **`dlx/package` `installRoot`** option overrides the Arborist install root (default `~/.socket/_dlx/<cacheKey>/`). Useful for colocating installs with consumer-owned build outputs.

## [5.27.0](https://github.com/SocketDev/socket-lib/releases/tag/v5.27.0) - 2026-05-04

### Added

- **45 new `primordials` exports** (296 total) — `BigIntCtor`; 24 `Math.*` methods + 8 constants (`MathF16round` typed `| undefined` for ES2025); 7 `Number` constants; 10 `Symbol` well-knowns + 3 prototype helpers (`SymbolAsyncDispose` / `SymbolDispose` typed `| undefined`); `FunctionPrototypeToString`; ES2023 array-copy (`ArrayPrototypeToSpliced`, `ArrayPrototypeWith`); `InfinityValue` / `NaNValue` / `globalThisRef`; `ObjectPrototype{Define,Lookup}{Getter,Setter}`; V8 stack-trace API.
- **`smol/*`** — feature-detect for socket-btm's smol Node binary. `smol/detect` (`isSmol()`), `smol/util` (`getSmolUtil()` — native `uncurryThis` / `applyBind`), `smol/primordial` (`getSmolPrimordial()` — V8 Fast API typed `Math.*` / `Number.is*`). `primordials` routes through these on smol transparently; no call-site changes.
- **`node/*`** — per-builtin lazy-loaders, side-effect-free for tree-shaking: `node/fs`, `node/path`, `node/crypto`, `node/http`, `node/https`, `node/os`, `node/util`, `node/url`, `node/events`, `node/child-process`, `node/async-hooks`, `node/fs-promises`, `node/timers-promises`.

## [5.26.1](https://github.com/SocketDev/socket-lib/releases/tag/v5.26.1) - 2026-05-01

### Added

- `crypto` (new export) — `hash(algorithm, data, encoding)` one-shot helper that prefers Node's native `crypto.hash` (added v21.7.0 / v20.12.0; ~30% faster than `createHash().update().digest()` on small inputs) with a streaming fallback. `getNativeHash` exposed as `@internal` for tests
- `promises` `fromAsync<T>(source)` — drains an async iterable into an array, per [TC39 Array.fromAsync](https://tc39.es/proposal-array-from-async/). Backed by the new `ArrayFromAsync` primordial (Node 22+) with a `for await` + push fallback
- `primordials` `ArrayFromAsync` — ES2024 primordial. Unbound, matching `ArrayFrom`
- `globs` `glob` / `globSync` route through `node:fs.glob` / `node:fs.globSync` (Node 22+) when caller options reduce to `cwd` + `ignore` (mapped to `exclude`); fall back to fast-glob for the wider option surface. Output paths are normalized to forward slashes on Windows to match fast-glob's contract
- `effects/shimmer` — pure-functional shimmer engine
- `effects/shimmer-terminal` — terminal (ANSI) renderer for the engine
- `effects/shimmer-keyframes` — SVG keyframe batcher for the engine
- `releases/github-types`, `github-assets`, `github-auth`, `github-api`, `github-downloads`, `github-archives` — six focused submodules replacing the single `releases/github` export

### Changed

- `http-request` retry/backoff sites use `setTimeout` from `node:timers/promises` instead of hand-rolled `new Promise(r => setTimeout(r, ms))`
- `dlx/cache`, `dlx/integrity`, `dlx/binary` — 4 one-shot hash sites switched to the new `crypto.hash()` helper
- `package.json` — pin `publishConfig: {access: "public", provenance: true}` so attestation is a property of the package, not a property of the workflow's `--provenance` CLI flag. Survives any direct-publish path that bypasses `provenance.yml`. `access: "public"` also load-bears for first-publish of `@scoped` packages on a fresh npm registry session.
- `promise-queue.runNext` — replace the `PromiseResolve().then().catch().finally()` chain with an async IIFE + try/catch/finally. Same semantics (defers `task.fn()` by one microtask so synchronous throws become rejections), more explicit about the success/error/cleanup flow.
- `packages/isolation.resolveRealPath` — replace `realpath().catch(fallback)` with try/await/catch. Same fall-back-on-ENOENT behavior, clearer that the catch is intentional.
- **BREAKING**: `spinner` `ShimmerInfo` shape — `{ direction, speed, frame }` (was: `currentDir`, `mode`, `speed`, `step`). User-facing `ShimmerConfig` is unchanged
- `getLatestRelease` / `getReleaseAssetUrl` return `undefined` (was: `null`) when no result is found, and no longer log on success/retry — errors throw, success returns

### Removed

- **BREAKING**: `effects/text-shimmer`, `effects/ultra`, `effects/types` subpath exports. Migrate to `effects/shimmer` (+ `effects/shimmer-terminal`); `RAINBOW_GRADIENT` now lives in `themes/utils`
- **BREAKING**: `themes` barrel export. Import from `themes/themes`, `themes/context`, `themes/utils`, or `themes/types`
- **BREAKING**: `releases/github` subpath export. Migrate to the focused submodules (see Added)
- `getLatestRelease({ quiet })` / `getReleaseAssetUrl({ quiet })` — the helpers no longer log

### Fixed

- `globs` `getGlobMatcher` — `path.matchesGlob` fast-path only activates when the caller opts out of both picomatch defaults (`nocase: false` AND `dot: false`); previously took the fast-path under default options and silently broke case-insensitive matching.
- `globs` `glob` / `globSync` — results normalized to forward slashes on Windows regardless of backend (`node:fs.glob` returns native-OS separators).
- `globs` `glob` / `globSync` / `globStreamLicenses` — trailing `/` stripped from `ignore` patterns before passing to fast-glob (gitignore-style `dist/` was silently dropped at the deep-filter level). Workaround for [mrmlnc/fast-glob#437](https://github.com/mrmlnc/fast-glob/issues/437).
- GitHub helpers (`releases/github-api`, `github/resolveRefToSha`, `fetchGhsaDetails`) fall back to GraphQL on the "search-degraded" 200 OK + empty body shape. Real 404s / rate-limits / 5xx still propagate.

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

- `github` — try/catch around `JSON.parse()` in API responses; error messages include the response URL
- `dlx/binary` — clock-skew protection (future timestamps treated as expired); atomic metadata write-then-rename; TOCTOU re-check of binary existence after metadata read
- `dlx/cache` — future-timestamped entries treated as expired during cleanup
- `dlx/package` — scoped-package parsing uses `atIndex === 0` (was `startsWith('@')`); fixes `@scope/pkg` installation failures
- `cache-with-ttl` — clock-skew detection (far-future `expiresAt` > 2x TTL treated as expired)
- `packages/specs` — only strips `.git` when URL actually ends with it (no more mid-URL truncation)
- `releases/github` — TOCTOU on binary download verification (re-checks after reading version file)
- `provenance` workflow — corrected package name `@socketregistry/lib` → `@socketsecurity/lib`

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

- `Logger` / `Spinner` — call `getDefaultLogger()` / `getDefaultSpinner()` once at module scope to prevent duplicate spinner indicators

## [3.2.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.2.0) - 2025-11-02

### Added

- `dlx` — unified manifest for packages and binaries

## [3.1.3](https://github.com/SocketDev/socket-lib/releases/tag/v3.1.3) - 2025-11-02

### Changed

- `@socketregistry/packageurl-js` updated to 1.3.5

## [3.1.2](https://github.com/SocketDev/socket-lib/releases/tag/v3.1.2) - 2025-11-02

### Fixed

- `Spinner` `setShimmer` — handle undefined properties via defaults
- External deps now go through the wrapper pattern (`require('../external/which')`, etc.) — maintains zero-deps policy

## [3.1.1](https://github.com/SocketDev/socket-lib/releases/tag/v3.1.1) - 2025-11-02

### Fixed

- `cache-with-ttl` — `cacache.put` wrapped in try/catch so persistent-cache write failures don't break in-memory reads

## [3.1.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.1.0) - 2025-11-01

### Changed

- `fs` `safeMkdir` / `safeMkdirSync` default to `recursive: true`

## [3.0.6](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.6) - 2025-11-01

### Added

- Build validation — guard against `link:` protocol dependencies in `package.json` (`validate-no-link-deps.mjs` runs during `pnpm run check`)

### Changed

- `@socketregistry/packageurl-js` updated to 1.3.3

## [3.0.5](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.5) - 2025-11-01

### Fixed

- **Critical**: prompts API restored — non-functional stub from v3.0.0 replaced with working implementation. `@socketsecurity/lib/stdio/prompts` exports `password`, `search`, `Separator`, `createSeparator()`. `Choice.name` (was erroneously `label`)

### Added

- Prompts adopt the active theme (`colors.prompt`, `textDim`, `primary`, `error`, `success`); `createInquirerTheme()` exported
- Theme parameter support — `Logger`, prompts, and text effects accept `theme: 'socket' | 'sunset' | 'terracotta' | 'lush' | 'ultra'` (or a Theme object)

### Removed

- **BREAKING**: `src/index.ts` deleted; main index `"."` / `"./index"` exports gone. Import specific modules: `@socketsecurity/lib/logger` instead of `@socketsecurity/lib`

## [3.0.4](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.4) - 2025-11-01

### Changed

- Sunset theme — azure blue → warm orange/purple gradient (Coana branding)
- `brick` theme renamed to `terracotta`

## [3.0.3](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.3) - 2025-11-01

### Fixed

- **Critical**: Node.js ESM/CJS interop — disabled esbuild minification (was breaking ESM named-import detection from CJS dist). ESM imports now work reliably

## [3.0.2](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.2) - 2025-11-01

### Fixed

- **Critical**: Node.js ESM named imports from CommonJS — `module.exports` placed before variable defs caused "Cannot access before initialization". Build now uses `@babel/parser` + `magic-string` to position exports at end of file

## [3.0.1](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.1) - 2025-11-01

### Added

- Convenience re-exports of `getDefaultLogger`, `Logger`, `LOG_SYMBOLS`, `getDefaultSpinner`, `Spinner` from main index for v2→v3 migration

### Fixed

- **Critical**: Spinner internal calls to removed `logger` export — use `getDefaultLogger()` (5 call sites)

## [3.0.0](https://github.com/SocketDev/socket-lib/releases/tag/v3.0.0) - 2025-11-01

### Added

- Theme system — 5 built-in themes (`socket`, `sunset`, `terracotta`, `lush`, `ultra`); `setTheme`, `getTheme`, `withTheme`, `withThemeSync`, `createTheme`, `extendTheme`, `resolveColor`, `onThemeChange`
- `links` `link()` — themed terminal hyperlinks
- Logger and spinner inherit theme colors
- Spinner methods: `enableShimmer`, `disableShimmer`, `setShimmer`, `updateShimmer`
- `dlx` cross-platform binary resolution (`.cmd`, `.bat`, `.ps1` on Windows)

### Changed

- Theme context uses `AsyncLocalStorage` instead of manual stack
- **BREAKING**: Promise retry options renamed — `factor` → `backoffFactor`, `minTimeout` → `baseDelayMs`, `maxTimeout` → `maxDelayMs`

### Removed

- **BREAKING**: `pushTheme()` / `popTheme()` — use `withTheme()` / `withThemeSync()`
- **BREAKING**: `logger` / `spinner` exports — use `getDefaultLogger()` / `getDefaultSpinner()`
- **BREAKING**: `download-lock.ts` — use `process-lock.ts`
- Promise option aliases: `factor`, `minTimeout`, `maxTimeout`

## [2.10.3](https://github.com/SocketDev/socket-lib/releases/tag/v2.10.3) - 2025-10-31

### Fixed

- `@socketregistry/packageurl-js` updated to 1.3.1 (resolves unintended external dep)
- JSDoc `@example` import paths corrected after v1.0.0 rename (`@socketsecurity/registry` → `@socketsecurity/lib`)

## [2.10.2](https://github.com/SocketDev/socket-lib/releases/tag/v2.10.2) - 2025-10-31

### Changed

- Package spec parsing uses official `npm-package-arg` library for full npm spec support (versions, ranges, tags, git URLs); falls back to simple parsing if it fails

### Fixed

- **Critical**: `parsePackageSpec` no longer strips the `@` prefix from scoped+versioned specs (e.g., `@coana-tech/cli@~14.12.51`)

## [2.10.1](https://github.com/SocketDev/socket-lib/releases/tag/v2.10.1) - 2025-10-31

### Fixed

- Process lock — recursive mkdir for parent dirs
- Removed buggy `getNodeDebugFlags()` (returned flags without required argument values)

## [2.10.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.10.0) - 2025-10-30

### Added

- Unified `.dlx-metadata.json` schema — `DlxMetadata` interface exported. Fields: `version`, `cache_key`, `timestamp`, `checksum`, `checksum_algorithm`, `platform`, `arch`, `size`, `source` (`{ type, url }`); reserved `extra` for impl-specific data

### Changed

- `dlx` `writeBinaryCacheMetadata()` adopts the unified schema (`cache_key` = SHA-512 prefix, `size`, `checksum_algorithm`, `source.type`/`source.url`)

## [2.9.1](https://github.com/SocketDev/socket-lib/releases/tag/v2.9.1) - 2025-10-30

### Added

- `dlxPackage` smart binary detection — uses single-binary packages directly regardless of name. Optional `binaryName` for explicit selection on multi-binary packages

### Fixed

- Binary resolution for scoped packages where package name ≠ binary name (e.g., `@socketsecurity/cli` exposes `bin: { socket: '...' }`)

## [2.9.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.9.0) - 2025-10-30

### Added

- `constants/socket` URL constants — `SOCKET_WEBSITE_URL`, `SOCKET_CONTACT_URL`, `SOCKET_DASHBOARD_URL`, `SOCKET_API_TOKENS_URL`, `SOCKET_PRICING_URL`, `SOCKET_STATUS_URL`, `SOCKET_DOCS_URL`

### Changed

- Error messages across the library — actionable resolution steps for fs, dlx, process-lock, downloads
- All locking consolidated on `process-lock` (atomic mkdir-based; 5s stale timeout aligned with npm npx)

## [2.8.4](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.4) - 2025-10-30

### Added

- `dlx` `downloadBinary` (cache without execution) and `executeBinary` (run cached binary). Internal `downloadBinary` renamed to `downloadBinaryFile` to avoid the naming conflict

## [2.8.3](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.3) - 2025-10-30

### Fixed

- `Logger` defers `Object.getOwnPropertySymbols(console)`, `kGroupIndentationWidth`, and `Object.entries(console)` until first use — safe to import in Node.js internal bootstrap contexts

## [2.8.2](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.2) - 2025-10-29

### Changed

- `Logger` defers `Console` creation until first use — eliminates early-bootstrap errors when imported before stdout is ready

## [2.8.1](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.1) - 2025-10-29

### Changed

- `dlx` — `generateCacheKey` extracted to shared module. Exported for downstream consumers (e.g. socket-cli)

## [2.8.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.8.0) - 2025-10-29

### Changed

- `dlx` cache keys — SHA-512 truncated to 16 chars (was SHA-256 / 64 chars), matching npm/npx. Better Windows `MAX_PATH` compatibility. Supports PURL specs (`npm:prettier@3.0.0`, `pypi:requests@2.31.0`)

## [2.7.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.7.0) - 2025-10-28

### Added

- `dlx` cache locking — `~/.socket/_dlx/<hash>/.lock` (npm-npx-style `concurrency.lock`). Prevents concurrent installations from corrupting the same package cache. 5s stale timeout, 2s periodic touch

## [2.6.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.6.0) - 2025-10-28

### Changed

- `process-lock` aligned with npm npx — 5s stale timeout (was 10s), 2s periodic touch, second-level mtime comparison (avoids APFS float precision), `unref()` timers, automatic cleanup on exit

## [2.5.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.5.0) - 2025-10-28

### Added

- `process-lock` `ProcessLockManager` — cross-platform inter-process sync via filesystem locks. Atomic `mkdir()` acquisition; stale-lock detection (10s default); exponential backoff with jitter; exit-handler cleanup. APIs: `acquire`, `release`, `withLock` (recommended)

### Changed

- `spinner.succeed()` renamed to `spinner.success()`

## [2.4.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.4.0) - 2025-10-28

### Changed

- `downloadWithLock()` default `staleTimeout` 300s → 10s (aligns with npm npx)
- `dlxBinary.downloadBinary()` uses `downloadWithLock()` to prevent corruption from concurrent binary downloads

## [2.3.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.3.0) - 2025-10-28

### Added

- `bin` `which()` / `whichSync()` — cross-platform binary lookup respecting `PATH`

## [2.2.1](https://github.com/SocketDev/socket-lib/releases/tag/v2.2.1) - 2025-10-28

### Fixed

- `Logger` `write()` bypasses Console formatting (group indentation, etc.) — now writes directly to the raw stdout reference captured at construction

## [2.2.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.2.0) - 2025-10-28

### Added

- `Logger` `step()` — cyan arrow `→` prefix (or `>` in ASCII fallback). New `LOG_SYMBOLS.step`

## [2.1.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.1.0) - 2025-10-28

### Added

- Package manager detection — `detectPackageManager()`, `getPackageManagerInfo()`, `getPackageManagerUserAgent()`
- `isInSocketDlx()` — check if a path is under `~/.socket/_dlx/`
- `downloadPackage()` / `executePackage()` — separate download and execution

## [2.0.0](https://github.com/SocketDev/socket-lib/releases/tag/v2.0.0) - 2025-10-27

### Changed

- **BREAKING**: Environment variable system refactor — 60+ individual `env/<NAME>.ts` files consolidated into grouped getter modules:
  - `env/github`, `env/socket`, `env/socket-cli`, `env/npm`, `env/locale`, `env/windows`, `env/xdg`, `env/temp-dir`, `env/test`
  - All env constants converted to functions: `import { GITHUB_TOKEN } from '#env/github-token'` → `import { getGithubToken } from '#env/github'`

### Added

- `env/rewire` and `paths/rewire` — AsyncLocalStorage-based env/path overrides for testing. `withEnv({...}, async () => {})` for isolated context, or `setEnv` / `resetEnv` for `beforeEach`/`afterEach`
- `getCacache()` exported

## [1.3.6](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.6) - 2025-10-26

### Fixed

- `debug` functions no longer tree-shaken as no-ops — removed incorrect `/*@__NO_SIDE_EFFECTS__*/` annotations on `debug`, `debugDir`, `debugLog` (+ `*Ns` variants)

## [1.3.5](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.5) - 2025-10-26

### Added

- `env` `createEnvProxy()` — Windows-compatible case-insensitive env var access (`PATH`, `Path`, `path` all work). Priority: overrides > exact match > case-insensitive fallback
- `env` `findCaseInsensitiveEnvKey()` — case-insensitive key search with length fast-path

### Fixed

- `spawn` preserves Windows `process.env` Proxy behavior (uses `process.env` directly when no custom env merges, keeping Windows case-insensitive access)

## [1.3.4](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.4) - 2025-10-26

### Added

- `constants/node` — `supportsNodeDisableSigusr1Flag()`, `getNodeDisableSigusr1Flags()`. Returns `['--disable-sigusr1']` on Node 22.14+/23.7+/24.8+, falls back to `['--no-inspect']` on Node 18+

## [1.3.3](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.3) - 2025-10-24

### Fixed

- `objects` `defineGetter`, `defineLazyGetter`, `defineLazyGetters` — removed incorrect `/*@__NO_SIDE_EFFECTS__*/` annotations (these mutate objects). Lazy getters were returning `undefined` after esbuild tree-shaking

## [1.3.2](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.2) - 2025-10-24

### Fixed

- Continued fixing of broken external dependency bundling

## [1.3.1](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.1) - 2025-10-24

### Fixed

- `@inquirer` modules (`input`, `password`, `search`) properly bundled into `dist/external/` — fixes build failures in downstream socket-cli

### Added

- Added tests to prevent rogue external stubs in `dist/external/`
  - Detects stub re-export patterns that indicate incomplete bundling
  - Verifies all @inquirer modules are properly bundled (> 1KB)
  - Catches bundling regressions early in CI pipeline

## [1.3.0](https://github.com/SocketDev/socket-lib/releases/tag/v1.3.0) - 2025-10-23

### Added

- `fs` `validateFiles()` — returns `{ validPaths, invalidPaths }`. Filters unreadable files before processing (Yarn Berry PnP, pnpm symlinks)

## [1.2.0](https://github.com/SocketDev/socket-lib/releases/tag/v1.2.0) - 2025-10-23

### Added

- `dlx-package` — install and execute npm packages directly. Content-addressed cache (SHA256). Auto-force for version ranges (`^`, `~`, `>`, `<`). Resolves binaries from `package.json` `bin`

### Changed

- Unified DLX storage under `~/.socket/_dlx/` (binary downloads + npm packages share content-addressed parent)

## [1.1.2] - 2025-10-23

### Fixed

- Broken relative import paths in `packages/isolation.ts` / `packages/provenance.ts`

## [1.1.1] - 2025-10-23

### Fixed

- Shimmer text effects respect CI detection (disabled in CI to avoid ANSI escapes in logs)

## [1.1.0] - 2025-10-23

### Added

- `stdio/mask` — `filterOutput` (filter output chunks before display) and `overrideExitCode` (customize exit codes from captured output)
- Comprehensive JSDoc across the library for IntelliSense (`@param`, `@returns`, `@example`, `@default`)

## [1.0.5] - 2025-10-22

### Added

- Custom retry delays from `onRetry` callback

## [1.0.4] - 2025-10-21

### Fixed

- External dep paths in root-level dist files (`../external/` → `./external/`)

## [1.0.3] - 2025-10-21

### Fixed

- External dep import paths in `packages/` and `stdio/` modules (`../../external/` → `../external/`)

## [1.0.2] - 2025-10-21

### Fixed

- `packages/normalize` module resolution (`../../constants/socket` → `../constants/socket`)

## [1.0.1] - 2025-10-21

### Fixed

- Relative imports in compiled CommonJS — root-level dist files use `./external/...`

## [1.0.0] - 2025-10-20

### Changed

- `parseArgs` consolidated into `argv/parse`

---

**Historical Entries**: The entries below are from when this package was named `@socketsecurity/registry`. This package was renamed to `@socketsecurity/lib` starting with version 1.0.0.

---

These entries cover versions 1.0.0 → 1.5.3 of the previous package name (`@socketsecurity/registry`, Sep 2025 – Oct 2025). The version-number line restarted at 1.0.0 when the package was renamed to `@socketsecurity/lib`, so the current 1.x and 5.x lines do **not** continue from these old versions. Listed here for archival reference only.

### Highlights

- **1.5.x** (Oct 2025) — `isolatePackage` for isolated package test environments; v8 coverage utilities; `dependencies/index` barrel removed
- **1.4.x** (Oct 2025) — Performance monitoring + memoization utilities; table formatting (`formatTable`, `formatSimpleTable`); spinner progress; `isDir`, `safeStats` async fs helpers
- **1.3.x** (Sep–Oct 2025) — Initial constants restructure, build configuration, package exports

For full details, see git history under the `@socketsecurity/registry` package name.
