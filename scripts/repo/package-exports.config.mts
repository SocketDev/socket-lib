/**
 * @file Socket-lib's opt-in config for the canonical package-exports
 *   generator (scripts/fleet/gen/package-exports.mts). socket-lib publishes.
 *
 * @socketsecurity/lib(-stable) as a per-leaf subpath surface: every dist file
 *   is its own export, browser-safe leaves carry a `browser` condition, and the
 *   top-level `browser` field stubs Node builtins for downstream browser bundlers
 *   (webpack / esbuild / rolldown) since socket-lib ships NO browser build of its
 *   own. The `./errors` convenience barrel is removed — use `./errors/message`
 *   (or `./errors/predicates` / `./errors/stack`) directly.
 *
 *   The browser-safe surface is a VERIFIED-compat claim — its source of truth
 *   is the audit matrix in docs/browser-compatibility.md. Add a prefix here
 *   only after auditing the subpath has zero Node deps.
 */

import type { ExportsConfig } from '../fleet/gen/package-exports.mts'
import { REPO_ROOT } from '../fleet/paths.mts'

export const packageDir: string = REPO_ROOT

export const config: ExportsConfig = {
  // Capability/env-swap aliases. The bare/explicit forms route to the Node leaf
  // by default; `browserTo` adds a `browser` condition sending browser bundlers
  // to the dedicated browser leaf instead (so they don't pull node:* via the
  // Node default). The former `./errors` barrel is removed — consumers migrate
  // to `./errors/message`.
  aliases: [
    {
      browserTo: './http-request/browser',
      from: './http-request',
      to: './http-request/node',
    },
    {
      browserTo: './http-request/browser',
      from: './http-request/http-request',
      to: './http-request/node',
    },
    { browserTo: './logger/browser', from: './logger', to: './logger/node' },
    // The singleton needs a condition of its own. The swap on `./logger` above
    // cannot cover it: that happens at RESOLVE time, and dist/logger/default.js
    // is built with the Node resolution already inlined, so a browser bundler
    // handed that file gets the Node logger whatever `./logger` says.
    //
    // Safe to point at the class leaf only because `./logger/browser` now
    // exports `getDefaultLogger()` too. If that ever stops being true this
    // alias resolves a consumer's `import { getDefaultLogger }` to a module
    // without it, in browser bundles only.
    {
      browserTo: './logger/browser',
      from: './logger/default',
      to: './logger/default',
    },
    {
      browserTo: './logger/browser',
      from: './logger/logger',
      to: './logger/node',
    },
    // Deliberately NO `browserTo`. The tarball twins are not a mirrored pair:
    // `./npm/registry/tarball/node` is a SUPERSET, adding the four disk exports
    // (extractNpmTarball, withNpmTarballFile, fetchAndExtractStagedTarball,
    // createNpmTarballScratchDir) that a browser has no filesystem for. A
    // browser condition here would silently drop those four in browser bundles
    // only — a missing-filesystem problem re-surfacing as a call-time
    // TypeError. Browser consumers import `./npm/registry/tarball/browser` and
    // find out at compile time instead.
    {
      from: './npm/registry/tarball',
      to: './npm/registry/tarball/node',
    },
    // The metadata client's twins ARE a mirrored pair — same named exports,
    // differing only in which HTTP adapter and which TtlCache store they
    // default to — so unlike the tarball entry above, a `browser` condition
    // here drops nothing. It is the whole point: a web extension importing
    // `./npm/meta` resolves the fetch-backed, memo-cached browser twin, and a
    // server importing the same specifier still gets the Node stack and the
    // cacache-backed store.
    //
    // The browser twins carry two EXTRA exports (`createWebStorageAdapter`,
    // `createWebStorageMetaCache`) that only mean something in a browser.
    // Extra-in-browser is the safe direction for a condition: a Node consumer
    // never silently loses an export, and a browser consumer who wants those
    // two imports `./npm/meta-cache/browser` explicitly, so `tsc` — which
    // resolves types through the `default` condition — agrees with the bundler
    // instead of reporting a symbol the runtime has.
    {
      browserTo: './npm/meta/browser',
      from: './npm/meta',
      to: './npm/meta/node',
    },
    {
      browserTo: './npm/meta-cache/browser',
      from: './npm/meta-cache',
      to: './npm/meta-cache/node',
    },
  ],
  // Browser-safe export paths (glob-matched) — each gets a self-routing
  // `browser` condition. Subtree globs are audited zero-Node-dep families
  // (docs/browser-compatibility.md); `**/browser` catches leaves whose basename
  // IS the browser impl. Declaring this surface ALSO triggers the inferred
  // top-level `browser` field stubbing every Node builtin (the engine owns the
  // list — socket-lib ships no browser build but must tell downstream browser
  // bundlers to stub node:* reachable from these entries).
  browser: [
    './ai/builtin',
    './arrays/**',
    './colors/**',
    './debug/**',
    './errors/**',
    './memo/**',
    // Still NOT `./npm/**`. Every leaf under it is now browser-CAPABLE, but
    // three are the Node halves of twin pairs — `./npm/meta/node`,
    // `./npm/meta-cache/node`, `./npm/registry/tarball/node` — and a
    // self-routing `browser` condition on those would point a browser bundler
    // straight at the Node file. The twin ENTRIES (`./npm/meta`,
    // `./npm/meta-cache`) get their browser condition from a `browserTo`
    // alias above, which routes to the browser half; the browser halves
    // themselves are caught by `**/browser` below.
    //
    // This is also why neither `./npm/meta*` nor `./npm/meta/*` appears here,
    // despite the `./npm/registry*` + `./npm/registry/*` pair below looking
    // like a template to copy. `matchesGlob` makes `./npm/meta/*` one segment,
    // which matches `./npm/meta/node` — the exact Node twin this list must not
    // claim. `./npm/meta*` would match the `./npm/meta` and `./npm/meta-cache`
    // ENTRIES, whose targets are the Node halves, and a self-routing condition
    // would then override the correct `browserTo` with the Node file.
    // `check/browser-exports-have-no-node-builtins.mts` re-derives all of this
    // from the built bytes on every check run, so either mistake fails the
    // build rather than shipping a false claim.
    './npm/meta-slice',
    './npm/meta-types',
    // Both registry patterns keep their `*`. A wildcard-FREE pattern is a
    // SUBTREE prefix here, so a bare `./npm/registry` also claims
    // `./npm/registry/tarball/node` — the Node twin reaching node:fs and
    // node:zlib. `./npm/registry*` stops at the entry leaf; `./npm/registry/*`
    // is one segment, so it covers the sixteen helpers but not `tarball/node`.
    './npm/registry*',
    './npm/registry/*',
    './objects/**',
    './oci/**',
    './regexps/**',
    './strings/**',
    './url/**',
    './versions/**',
    './words/**',
    '**/browser',
  ],
  // The published file surface: the dist build PLUS two root-level published
  // artifacts — package.json (conventional self-export; tooling imports it) and
  // the data/ JSON shipped in `files`. The default glob only scans `dist/`;
  // name the root entries explicitly so they keep their `./package.json` /
  // `./data/*.json` public paths (publicPathFor strips only the outDir prefix).
  files: [
    'dist/**/*.{cjs,js,mjs,json,d.ts,d.mts,d.cts}',
    'data/**/*.json',
    'package.json',
  ],
  // Excluded from the public export surface. The privacy taxonomy (external/,
  // `_`-prefixed) is built into the engine; these are socket-lib's extras:
  // src/ (TS sources), the separately-built dist/external bundles, and the two
  // runtime-only bundled CLI artifacts under dist/bin (exposed via `bin`, not
  // as subpath exports).
  ignore: [
    'dist/bin/acorn-wasm.cjs',
    'dist/bin/prim.cjs',
    'dist/external/**',
    // `./logger/logger` is aliased to `./logger/node` (with a browser-condition
    // override), so the platform-agnostic re-export leaf `dist/logger/logger.*`
    // ships but no export reaches it — the alias jumps over it. Excluded so the
    // validator doesn't flag the shadowed leaf. (Latent: the alias could be
    // dropped to let `logger.js` self-route, but that changes resolution — out
    // of scope for the generator migration.)
    'dist/logger/logger.d.mts',
    'dist/logger/logger.d.ts',
    'dist/logger/logger.js',
    // Module-internal helper leaves. Every `*/shared.mts` header describes
    // itself as private to its directory; none had a real import across the
    // fleet, so v7 stops publishing them as subpaths.
    //
    // BOTH declaration extensions are listed. `.mts` sources emit `.d.mts`,
    // and naming only `.d.ts` silently re-published all 24 of these as public
    // subpaths when src moved to .mts - a 24-entry widening of the API that
    // looked like a generator quirk rather than a missing glob.
    'dist/**/shared.d.mts',
    'dist/**/shared.d.ts',
    'dist/**/shared.js',
    // Same rule for a shared core that outgrew one file. `npm/meta-cache`'s
    // private core splits in two to stay under the 500-line cap: `shared`
    // holds the cache plumbing and `shared-policy` holds the fetch and its
    // failure policies. The second half is no more public than the first.
    // Matching on the `shared-` prefix keeps that a CONVENTION rather than a
    // growing list of one-off paths — no `shared-*` leaf exists outside this
    // pattern's intent.
    'dist/**/shared-*.d.mts',
    'dist/**/shared-*.d.ts',
    'dist/**/shared-*.js',
    'src/**',
  ],
  nodeRange: '>=22',
  outDir: 'dist',
}
