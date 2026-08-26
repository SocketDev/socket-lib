# Browser compatibility

`@socketsecurity/lib` is primarily a Node.js library, but a growing number of subpaths are safe to use in browser contexts (Chrome MV3 service workers, content scripts, popups, web workers, Deno-the-runtime that lacks `node:*` polyfills, etc).

This doc tells you which subpaths work where, how to opt in, and what's blocked.

## TL;DR for AI agents

If you're an agent wiring up a browser/extension consumer, the short version:

1. **Use `import` paths normally.** Don't manually shop for `/browser` subpaths unless you want to be explicit. Bundlers (rolldown, vite, esbuild) that honor `package.json#exports[".browser"]` will pick the right entry automatically when their target is `browser`.
2. **If your bundler ignores the `browser` condition** (some configurations of webpack 5, raw `node` resolution), import the explicit subpath: `@socketsecurity/lib/logger/browser`, `@socketsecurity/lib/http-request/browser`.
3. **If you need a subpath not in the table below**, the answer is almost always either "it's Node-only by design" or "no one's added the `browser` condition yet" - file an issue and we'll triage.

## Subpath matrix

<details>
<summary>Every subpath and its verdict: zero-Node-dep leaves such as arrays, strings, objects, errors, url, colors and primordials; condition-flagged entries logger/browser, http-request/browser, cache/ttl/browser, debug, memo, npm/registry, oci and ai/builtin; case-by-case areas paths, themes, env, eco, perf and events; and Node-only areas fs, bin, spawn, process, ipc, archives, git, secrets, sea and dlx</summary>

| Subpath                                          | Browser                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./logger`                                       | ✅ via `./logger/browser` | Bundler `browser` condition resolves automatically. Singleton + `success`/`fail`/`warn`/`error`/`info`/`log` surface backed by `console.*`. No Node deps.                                                                                                                                                                                                                                                                              |
| `./logger/browser`                               | ✅ explicit               | Use this if your bundler doesn't honor conditions.                                                                                                                                                                                                                                                                                                                                                                                     |
| `./http-request/browser`                         | ✅ explicit               | `fetch()`-based `httpJson` / `httpText` / `httpRequest`. Full Node-parity options (`signal`, `timeout`, `followRedirects`, `maxResponseSize`, `hooks.onRequest`/`hooks.onResponse`, `retries`, `retryDelay`, `throwOnError`).                                                                                                                                                                                                          |
| `./http-request` (parent)                        | ⚠️ via bundler only       | Resolves to `./http-request/browser` when the `browser` condition fires. Direct `require()` falls through to the Node entry which imports `node:http`.                                                                                                                                                                                                                                                                                 |
| `./arrays/*`                                     | ✅                        | All 5 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./strings/*`                                    | ✅                        | All 6 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./objects/*`                                    | ✅                        | All 6 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./errors/*`                                     | ✅                        | All 3 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./url/*`                                        | ✅                        | All 4 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./regexps/*`                                    | ✅                        | All 3 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./versions/*`                                   | ✅                        | All 6 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./words/*`                                      | ✅                        | All 4 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./colors/*`                                     | ✅                        | All 4 files. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./themes/*`                                     | ⚠️ likely                 | All 4 files. No direct Node deps, but `themes/types.ts` re-exports from `spinner/types` which has a `node:stream` type-only import (stripped at compile time). Should bundle clean. Not yet flagged via `"browser"` condition.                                                                                                                                                                                                         |
| `./primordials/*`                                | ✅                        | All 18 files. Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                         |
| `./effects/*`                                    | ✅                        | All 4 files. Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                          |
| `./ansi/*`                                       | ✅                        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./cache/ttl/browser`                            | ✅ flagged                | `createBrowserTtlCache` - TTL cache over an injectable storage adapter (`chrome.storage.local`, `sessionStorage`, …) or memo-only. Primordials-only import graph. `browser` condition emitted.                                                                                                                                                                                                                                         |
| `./cache/*`                                      | ✅                        | TTL store + types. `./cache/ttl/store` loads clean (cacache is required lazily) but persists via the filesystem at call time - use `./cache/ttl/browser` in browser contexts.                                                                                                                                                                                                                                                          |
| `./crypto/*`                                     | ✅                        | Zero Node deps (uses Web Crypto API + primordials). Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                   |
| `./debug/*`                                      | ✅ flagged                | Loads clean with node builtins stubbed; output no-ops when `SOCKET_DEBUG` is unreadable (no `process`). Node-bound pieces (debug-js, spinner, logger construction) defer to first enabled write. Verified by the e2e vm test.                                                                                                                                                                                                          |
| `./globs/*`                                      | ✅                        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./json/*`                                       | ✅                        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./links/*`                                      | ✅                        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./memo/*`                                       | ✅ flagged                | Memoization helpers incl. `memoizeAsync`. Loads + runs with node builtins stubbed (debug output no-ops). Verified by the e2e vm test.                                                                                                                                                                                                                                                                                                  |
| `./npm/registry`, `./npm/registry/*`             | ✅ flagged                | Browser-safe npm registry client - pure parsers + injectable-fetch shell across the `registry` entry and every `registry/*` helper (access, audit, auth, cache, client, live, oidc, org, publish, search, stage, stage-actions, stage-tarball, team, tokens, trust). Zero Node deps; HTTP adapter injected by caller. `browser` condition emitted.                                                                                     |
| `./npm/registry/tarball/browser`                 | ✅ explicit               | In-memory npm tarball reader: `readNpmTarballEntries` / `readNpmTarballManifest`. Gunzips with `DecompressionStream('gzip')`, then a pure header walk shared with the Node twin. Same limits as the disk extractor (entry count, file size, total size, null bytes, links). Verified by the e2e webpack + vm test.                                                                                                                     |
| `./npm/registry/tarball` (parent)                | ❌                        | Resolves to the Node twin for EVERY bundler - deliberately no `browser` condition. It is a superset, adding four disk exports a browser has no filesystem for, so a silent swap would drop them in browser builds only. Import `./npm/registry/tarball/browser` for the in-memory half.                                                                                                                                                |
| `./npm/meta`, `./npm/meta-cache`                 | ✅ flagged                | Cached packument fetch. Both are node/browser twin pairs whose `browser` condition resolves to the browser half, so the bare subpath is correct in a web extension. The HTTP adapter and the `TtlCache` store are both injected, so nothing platform-specific is reachable from the shared core. Node keeps `httpJson` + the cacache store; the browser gets `fetch` + `createBrowserTtlCache`. Verified by the e2e webpack + vm test. |
| `./npm/meta/browser`, `./npm/meta-cache/browser` | ✅ explicit               | The browser halves, importable directly. They carry two extra exports the Node halves have no meaning for: `createWebStorageAdapter` and `createWebStorageMetaCache`. See "Choosing a browser cache tier" below.                                                                                                                                                                                                                       |
| `./npm/meta/node`, `./npm/meta-cache/node`       | ❌                        | The Node halves, importable directly when you want to pin the platform. Reach `node:zlib` / `node:fs` through `http-request/node` and `cache/ttl/store`, so never import these from browser code - import the bare `./npm/meta` subpath and let the condition choose.                                                                                                                                                                  |
| `./npm/meta-slice`, `./npm/meta-types`           | ✅ flagged                | Pure packument slicer and the shared type surface. Zero Node deps.                                                                                                                                                                                                                                                                                                                                                                     |
| `./oci/*`                                        | ✅ flagged                | Browser-safe OCI distribution-spec anonymous-pull client (registry-token / manifest / blob / registry). Pure parsers + an injectable `{ http }` adapter (`json` + `request`); zero Node deps. `browser` condition emitted.                                                                                                                                                                                                             |
| `./packages/*`                                   | ✅                        | Package metadata helpers. Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                             |
| `./paths/*`                                      | ⚠️                        | Path-string helpers, but the file you want is OS-aware (POSIX vs Windows separators). Mostly browser-safe; case-by-case.                                                                                                                                                                                                                                                                                                               |
| `./promises/*`                                   | ✅                        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./schema/*`                                     | ✅                        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./ai/builtin`                                   | ✅ flagged                | Returns the browser's `globalThis.LanguageModel` factory. Node falls back to `node:smol-ai` and `@node-smol/ai`. The webpack VM test verifies browser execution without `process` or `require`.                                                                                                                                                                                                                                        |
| Other `./smol/*` leaves                          | ⚠️ case-by-case           | Smol feature loaders import the browser-stubbed `module` adapter and may expose Node-specific types. Audit each leaf before adding a browser condition.                                                                                                                                                                                                                                                                                |
| `./sorts/*`                                      | ✅                        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./ssri/*`                                       | ✅                        | Subresource Integrity helpers. Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                        |
| `./streams/*`                                    | ✅ via Web Streams        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./tables/*`                                     | ✅                        | Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./temporal/*`                                   | ✅                        | Time-string helpers. Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                  |
| `./pkg-ext/*`                                    | ✅                        | File-extension constants. Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                             |
| `./abort/*`                                      | ✅                        | `AbortSignal` helpers. Zero Node deps. Not yet flagged.                                                                                                                                                                                                                                                                                                                                                                                |
| `./checks/primordials`                           | ❌                        | `node:assert` import. Test helper.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `./fs/*`                                         | ❌                        | `node:fs` throughout. No browser equivalent - use `chrome.storage` / `IndexedDB` directly.                                                                                                                                                                                                                                                                                                                                             |
| `./bin/*`                                        | ❌                        | Executable discovery - `node:child_process`, `node:path`. N/A in browser.                                                                                                                                                                                                                                                                                                                                                              |
| `./spawn/*` (in lib-stable as `./spawn`)         | ❌                        | Subprocess spawning. N/A in browser.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `./process/*`                                    | ❌                        | `node:process` lifecycle, signals. N/A.                                                                                                                                                                                                                                                                                                                                                                                                |
| `./ipc/*`                                        | ❌                        | Node's IPC channel. N/A.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `./ipc-cli/*`                                    | ❌                        | Subprocess IPC over CLI. N/A.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `./archives/*` (zip, tar)                        | ❌                        | `node:zlib`, `node:stream`. Use `CompressionStream` / `DecompressionStream` browser APIs instead.                                                                                                                                                                                                                                                                                                                                      |
| `./compression/*`                                | ⚠️                        | Some entries use `node:zlib`; some are pure.                                                                                                                                                                                                                                                                                                                                                                                           |
| `./git/*`                                        | ❌                        | Subprocess git calls. N/A.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `./github/*`                                     | ❌                        | Some entries shell out via `gh` CLI.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `./external-tools/*`                             | ❌                        | Per-tool installers (cargo, bazel, etc). N/A.                                                                                                                                                                                                                                                                                                                                                                                          |
| `./secrets/*`                                    | ❌                        | OS keychain - macOS Security framework, Linux libsecret, Windows CredentialManager. N/A in browser; use `chrome.storage.session` for ephemeral secrets.                                                                                                                                                                                                                                                                                |
| `./sea/*`                                        | ❌                        | Node Single-Executable-Application packaging. N/A.                                                                                                                                                                                                                                                                                                                                                                                     |
| `./eco/*`                                        | ⚠️                        | Ecosystem helpers (npm/pip/etc) - mixed. Pure metadata helpers may work; ones that read filesystem don't.                                                                                                                                                                                                                                                                                                                              |
| `./node/*`                                       | ❌                        | Direct Node.js runtime helpers (version detection, etc). N/A.                                                                                                                                                                                                                                                                                                                                                                          |
| `./env/*`                                        | ⚠️                        | Environment-variable helpers - some read `process.env`, browser equivalent doesn't exist.                                                                                                                                                                                                                                                                                                                                              |
| `./argv/*`                                       | ❌                        | CLI argv parsing. N/A in browser.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `./cacache/*`                                    | ❌                        | Filesystem cache via npm's cacache lib. N/A.                                                                                                                                                                                                                                                                                                                                                                                           |
| `./stdio/*`                                      | ❌                        | stdout/stderr stream control. N/A.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `./shadow/*`                                     | ❌                        | npm shadow registry. N/A.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `./perf/*`                                       | ⚠️                        | Some use `node:perf_hooks`; browser equivalent is `performance.now()`.                                                                                                                                                                                                                                                                                                                                                                 |
| `./events/*`                                     | ⚠️                        | Some use Node's `EventEmitter`; browser has `EventTarget`.                                                                                                                                                                                                                                                                                                                                                                             |
| `./spinner/*`                                    | ❌                        | Terminal spinner. N/A in browser.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `./dlx/*`                                        | ❌                        | `npx`-equivalent. N/A.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `./constants/*`                                  | ⚠️                        | Mostly browser-safe constants, but the umbrella entry pulls in Node-dependent modules. Import individual leaf files.                                                                                                                                                                                                                                                                                                                   |

</details>

## Opting in as a consumer

### Bundlers (rolldown, vite, esbuild)

These honor `package.json#exports[".browser"]` automatically when their target is `browser` / `web`. No code changes needed:

<details>
<summary>The four snippets: an unchanged logger import that resolves to the browser shim, a rolldown `platform: 'browser'` config, a vite `resolve.conditions` list, and the esbuild `--platform=browser` flag</summary>

```ts
// In your extension's src/background.mts
import { getDefaultLogger } from '@socketsecurity/lib/logger/default'

const logger = getDefaultLogger()
logger.success('hello from the SW')
```

Your bundler picks the browser shim `dist/logger/browser.js` instead of the Node `dist/logger/default.js`.

For rolldown specifically:

```ts
// .config/rolldown.config.mts
export default {
  // ...
  platform: 'browser',
  // The "browser" export condition is honored implicitly when platform: 'browser'.
}
```

For vite:

```ts
// vite.config.ts
export default {
  resolve: {
    conditions: ['browser', 'import', 'default'],
  },
}
```

For esbuild:

```sh
esbuild --platform=browser src/index.ts
```

</details>

### Direct imports (when the bundler ignores conditions)

When the bundler ignores conditions OR you want to be explicit:

```ts
import { getDefaultLogger } from '@socketsecurity/lib/logger/browser'
import { httpJson } from '@socketsecurity/lib/http-request/browser'
```

This works in every bundler regardless of conditional support.

### Without a bundler (rare in browser contexts)

If you're authoring a script tag that loads directly into a browser via ESM imports + import maps, point the bare specifier at the prebuilt browser entry:

```html
<script type="importmap">
  {
    "imports": {
      "@socketsecurity/lib/logger": "/node_modules/@socketsecurity/lib/dist/logger/browser.js",
      "@socketsecurity/lib/http-request": "/node_modules/@socketsecurity/lib/dist/http-request/browser.js"
    }
  }
</script>
```

### Choosing a browser cache tier

`./npm/meta-cache` and `./cache/ttl/browser` both default to a **memory-only** cache: hot entries live in an LRU `Map` and nothing is written anywhere. Reach for a durable tier explicitly.

That default is a decision, not a placeholder:

- **No web storage API exists in every context these modules target.** An MV3 service worker has no `localStorage` and no `window`; a sandboxed iframe throws `SecurityError` on first access. A default that reaches for one is a default that throws somewhere real.
- **`localStorage` is the wrong shape for packuments.** It is synchronous main-thread I/O with a roughly 5 MB origin budget, and one slimmed packument for a popular package runs to hundreds of KB. Caching them there evicts the host application's own data to store something re-fetchable.
- **A cache is never load-bearing here.** Every read falls back to a fetch, so losing the tier across a page load costs latency, never correctness.

Pick the tier that matches your context:

| Context                              | Suggested tier                    | How                                                   |
| ------------------------------------ | --------------------------------- | ----------------------------------------------------- |
| MV3 service worker / extension       | `chrome.storage.local`            | Wrap it as a `TtlCacheStorage` and pass `{ storage }` |
| Page or content script, small budget | `sessionStorage` / `localStorage` | `createWebStorageMetaCache(localStorage)`             |
| Page, large or long-lived data       | IndexedDB                         | Wrap it as a `TtlCacheStorage` and pass `{ storage }` |
| Anything else, or unsure             | memory-only                       | The default; pass nothing                             |

```ts
import {
  createNpmMetaCache,
  createWebStorageMetaCache,
  getPackumentSlim,
} from '@socketsecurity/lib/npm/meta-cache/browser'
import { httpJson } from '@socketsecurity/lib/http-request/browser'

// Durable across reloads, one line.
const cache = createWebStorageMetaCache(localStorage)

// Or bring your own store - chrome.storage.local, IndexedDB, anything with a
// key/value string surface.
const extensionCache = createNpmMetaCache({
  storage: {
    async getItem(key) {
      return (await chrome.storage.local.get(key))[key]
    },
    async keys() {
      return Object.keys(await chrome.storage.local.get(null))
    },
    async removeItem(key) {
      await chrome.storage.local.remove(key)
    },
    async setItem(key, value) {
      await chrome.storage.local.set({ [key]: value })
    },
  },
})

const meta = await getPackumentSlim('left-pad', {
  cache,
  http: { json: httpJson },
})
```

Storage failures are always swallowed: a `QuotaExceededError` or a blocked `localStorage` degrades the cache to memory-only rather than failing the fetch. The persisted-stale and storm-control tiers receive the same adapter as the primary cache, so serve-stale-on-error survives a reload too.

## What doesn't work and why

Some classes of functionality fundamentally don't exist in browsers:

- **Filesystem access** (`fs`, `cacache`, `archives`, `globs`). Browsers don't have arbitrary disk access. Closest equivalents: `chrome.storage.local`, IndexedDB, OPFS, the File System Access API (origin-locked).
- **Subprocess spawning** (`bin`, `git`, `external-tools`, `dlx`). Browsers can't fork processes. Closest equivalent: web workers + a service worker proxy to a remote API.
- **OS-level secrets** (`secrets`). Browsers have `chrome.storage.session` (ephemeral, no keychain integration) and `WebAuthn` for credential challenges. Neither maps cleanly to the lib's keychain abstraction.
- **TTY / stdio control** (`stdio`, `spinner`). No terminal in a browser. Use DOM updates instead.
- **CLI argv parsing** (`argv`). Browser scripts have no command-line arguments. Use URL search params or message passing.

## Adding `"browser"` condition to a new subpath

If you've audited a subpath and confirmed it's browser-safe (no `node:*` imports, no transitive Node deps), add the `"browser"` condition to its `package.json#exports` entry:

```jsonc
{
  "exports": {
    "./my-subpath": {
      "browser": {
        "source": "./src/my-subpath.ts",
        "types": "./dist/my-subpath.d.ts",
        "default": "./dist/my-subpath.js",
      },
      "source": "./src/my-subpath.ts",
      "types": "./dist/my-subpath.d.ts",
      "default": "./dist/my-subpath.js",
    },
  },
}
```

For modules that NEED a separate browser implementation (because their Node version imports `node:*`), add a parallel `./<path>/browser.ts`:

1. Create `src/<path>/browser.ts` mirroring the public surface
2. Add `./<path>/browser` as a sibling export entry
3. Add a `"browser"` condition pointing to the new entry on the parent `./<path>` entry
4. Add `/// <reference lib="dom" />` at the top if you use `fetch`, `Blob`, `Headers`, etc.
5. Add tests under `test/unit/<path>/browser.test.mts`

## Related sibling packages

- **`@socketsecurity/sdk`** - exposes `./http-client/browser` for browser HTTP. The full SDK class (which handles file uploads via `node:fs`) is Node-only. The browser entry covers org-package scoring + malware checks via plain HTTP.
- **`@socketsecurity/packageurl-js`** - already zero-Node. Has `"browser"` conditions on `.` and `./exists`.

## Companion docs

- `docs/getting-started.md` - top-level intro
- `docs/http-utilities.md` - Node-side httpJson / httpText / httpRequest
- `docs/api.md` - auto-generated subpath catalog
