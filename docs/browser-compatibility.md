# Browser compatibility

`@socketsecurity/lib` is primarily a Node.js library, but a growing number of subpaths are safe to use in browser contexts (Chrome MV3 service workers, content scripts, popups, web workers, Deno-the-runtime that lacks `node:*` polyfills, etc).

This doc tells you which subpaths work where, how to opt in, and what's blocked.

## TL;DR for AI agents

If you're an agent wiring up a browser/extension consumer, the short version:

1. **Use `import` paths normally.** Don't manually shop for `/browser` subpaths unless you want to be explicit. Bundlers (rolldown, vite, esbuild) that honor `package.json#exports[".browser"]` will pick the right entry automatically when their target is `browser`.
2. **If your bundler ignores the `browser` condition** (some configurations of webpack 5, raw `node` resolution), import the explicit subpath: `@socketsecurity/lib/logger/browser`, `@socketsecurity/lib/http-request/browser`.
3. **If you need a subpath not in the table below**, the answer is almost always either "it's Node-only by design" or "no one's added the `browser` condition yet" — file an issue and we'll triage.

## Subpath matrix

| Subpath | Browser | Notes |
|---|---|---|
| `./logger` | ✅ via `./logger/browser` | Bundler `browser` condition resolves automatically. Singleton + `success`/`fail`/`warn`/`error`/`info`/`log` surface backed by `console.*`. No Node deps. |
| `./logger/browser` | ✅ explicit | Use this if your bundler doesn't honor conditions. |
| `./http-request/browser` | ✅ explicit | `fetch()`-based `httpJson` / `httpText` / `httpRequest`. Full Node-parity options (`signal`, `timeout`, `followRedirects`, `maxResponseSize`, `hooks.onRequest`/`hooks.onResponse`, `retries`, `retryDelay`, `throwOnError`). |
| `./http-request` (parent) | ⚠️ via bundler only | Resolves to `./http-request/browser` when the `browser` condition fires. Direct `require()` falls through to the Node entry which imports `node:http`. |
| `./arrays/*` | ✅ | All 5 files. Zero Node deps. |
| `./strings/*` | ✅ | All 6 files. Zero Node deps. |
| `./objects/*` | ✅ | All 6 files. Zero Node deps. |
| `./errors/*` | ✅ | All 3 files. Zero Node deps. |
| `./url/*` | ✅ | All 4 files. Zero Node deps. |
| `./regexps/*` | ✅ | All 3 files. Zero Node deps. |
| `./versions/*` | ✅ | All 6 files. Zero Node deps. |
| `./words/*` | ✅ | All 4 files. Zero Node deps. |
| `./colors/*` | ✅ | All 4 files. Zero Node deps. |
| `./themes/*` | ⚠️ likely | All 4 files. No direct Node deps, but `themes/types.ts` re-exports from `spinner/types` which has a `node:stream` type-only import (stripped at compile time). Should bundle clean. Not yet flagged via `"browser"` condition. |
| `./primordials/*` | ✅ | All 18 files. Zero Node deps. Not yet flagged. |
| `./effects/*` | ✅ | All 4 files. Zero Node deps. Not yet flagged. |
| `./ansi/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./cache/*` | ✅ | TTL store + types. Zero Node deps. Not yet flagged. |
| `./crypto/*` | ✅ | Zero Node deps (uses Web Crypto API + primordials). Not yet flagged. |
| `./debug/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./globs/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./json/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./links/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./memo/*` | ✅ | Memoization helpers. Zero Node deps. Not yet flagged. |
| `./packages/*` | ✅ | Package metadata helpers. Zero Node deps. Not yet flagged. |
| `./paths/*` | ⚠️ | Path-string helpers, but the file you want is OS-aware (POSIX vs Windows separators). Mostly browser-safe; case-by-case. |
| `./promises/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./schema/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./smol/*` | ✅ | Lightweight versions of larger lib helpers. Zero Node deps. Not yet flagged. |
| `./sorts/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./ssri/*` | ✅ | Subresource Integrity helpers. Zero Node deps. Not yet flagged. |
| `./streams/*` | ✅ via Web Streams | Zero Node deps. Not yet flagged. |
| `./tables/*` | ✅ | Zero Node deps. Not yet flagged. |
| `./temporal/*` | ✅ | Time-string helpers. Zero Node deps. Not yet flagged. |
| `./pkg-ext/*` | ✅ | File-extension constants. Zero Node deps. Not yet flagged. |
| `./abort/*` | ✅ | `AbortSignal` helpers. Zero Node deps. Not yet flagged. |
| `./checks/primordials` | ❌ | `node:assert` import. Test helper. |
| `./fs/*` | ❌ | `node:fs` throughout. No browser equivalent — use `chrome.storage` / `IndexedDB` directly. |
| `./bin/*` | ❌ | Executable discovery — `node:child_process`, `node:path`. N/A in browser. |
| `./spawn/*` (in lib-stable as `./spawn`) | ❌ | Subprocess spawning. N/A in browser. |
| `./process/*` | ❌ | `node:process` lifecycle, signals. N/A. |
| `./ipc/*` | ❌ | Node's IPC channel. N/A. |
| `./ipc-cli/*` | ❌ | Subprocess IPC over CLI. N/A. |
| `./archives/*` (zip, tar) | ❌ | `node:zlib`, `node:stream`. Use `CompressionStream` / `DecompressionStream` browser APIs instead. |
| `./compression/*` | ⚠️ | Some entries use `node:zlib`; some are pure. |
| `./git/*` | ❌ | Subprocess git calls. N/A. |
| `./github/*` | ❌ | Some entries shell out via `gh` CLI. |
| `./external-tools/*` | ❌ | Per-tool installers (cargo, bazel, etc). N/A. |
| `./secrets/*` | ❌ | OS keychain — macOS Security framework, Linux libsecret, Windows CredentialManager. N/A in browser; use `chrome.storage.session` for ephemeral secrets. |
| `./sea/*` | ❌ | Node Single-Executable-Application packaging. N/A. |
| `./eco/*` | ⚠️ | Ecosystem helpers (npm/pip/etc) — mixed. Pure metadata helpers may work; ones that read filesystem don't. |
| `./node/*` | ❌ | Direct Node.js runtime helpers (version detection, etc). N/A. |
| `./env/*` | ⚠️ | Environment-variable helpers — some read `process.env`, browser equivalent doesn't exist. |
| `./argv/*` | ❌ | CLI argv parsing. N/A in browser. |
| `./cacache/*` | ❌ | Filesystem cache via npm's cacache lib. N/A. |
| `./stdio/*` | ❌ | stdout/stderr stream control. N/A. |
| `./shadow/*` | ❌ | npm shadow registry. N/A. |
| `./perf/*` | ⚠️ | Some use `node:perf_hooks`; browser equivalent is `performance.now()`. |
| `./events/*` | ⚠️ | Some use Node's `EventEmitter`; browser has `EventTarget`. |
| `./spinner/*` | ❌ | Terminal spinner. N/A in browser. |
| `./dlx/*` | ❌ | `npx`-equivalent. N/A. |
| `./constants/*` | ⚠️ | Mostly browser-safe constants, but the umbrella entry pulls in Node-dependent modules. Import individual leaf files. |

## Opting in as a consumer

### Bundlers (rolldown, vite, esbuild)

These honor `package.json#exports[".browser"]` automatically when their target is `browser` / `web`. No code changes needed:

```ts
// In your extension's src/background.mts
import { getDefaultLogger } from '@socketsecurity/lib/logger'

const logger = getDefaultLogger()
logger.success('hello from the SW')
```

Your bundler picks `dist/logger/browser.js` (the shim) instead of `dist/logger/default.js` (the Node Logger class).

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
        "default": "./dist/my-subpath.js"
      },
      "source": "./src/my-subpath.ts",
      "types": "./dist/my-subpath.d.ts",
      "default": "./dist/my-subpath.js"
    }
  }
}
```

For modules that NEED a separate browser implementation (because their Node version imports `node:*`), add a parallel `./<path>/browser.ts`:

1. Create `src/<path>/browser.ts` mirroring the public surface
2. Add `./` <path>`/browser` as a sibling export entry
3. Add a `"browser"` condition pointing to the new entry on the parent `./` <path>` entry
4. Add `/// <reference lib="dom" />` at the top if you use `fetch`, `Blob`, `Headers`, etc.
5. Add tests under `test/unit/<path>/browser.test.mts`

## Related sibling packages

- **`@socketsecurity/sdk`** — exposes `./http-client/browser` for browser HTTP. The full SDK class (which handles file uploads via `node:fs`) is Node-only. The browser entry covers org-package scoring + malware checks via plain HTTP.
- **`@socketsecurity/packageurl-js`** — already zero-Node. Has `"browser"` conditions on `.` and `./exists`.

## Companion docs

- `docs/getting-started.md` — top-level intro
- `docs/http-utilities.md` — Node-side httpJson / httpText / httpRequest
- `docs/api-index.md` — auto-generated subpath catalog
