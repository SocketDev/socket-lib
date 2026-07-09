/**
 * @file Socket-lib's opt-in config for the canonical make-package-exports
 *   generator (scripts/fleet/make-package-exports.mts). socket-lib publishes.
 *
 * @socketsecurity/lib(-stable) as a per-leaf subpath surface: every dist file
 *   is its own export, browser-safe leaves carry a `browser` condition, and the
 *   top-level `browser` field stubs Node builtins for downstream browser bundlers
 *   (webpack / esbuild / rolldown) since socket-lib ships NO browser build of its
 *   own. The `./errors` convenience barrel is removed — use `./errors/message`
 *   (or `./errors/predicates` / `./errors/stack`) directly.
 *
 *   The browser-safe surface is a VERIFIED-compat claim — its source of truth
 *   is docs/browser-compatibility.md (the audit matrix). Add a prefix here only
 *   after auditing the subpath has zero Node deps.
 */

import type { ExportsConfig } from '../fleet/make-package-exports.mts'
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
    {
      browserTo: './logger/browser',
      from: './logger/logger',
      to: './logger/node',
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
    './arrays/**',
    './colors/**',
    './debug/**',
    './errors/**',
    './memo/**',
    './npm/**',
    './objects/**',
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
    'dist/bin/acorn-bindgen.cjs',
    'dist/bin/prim.cjs',
    'dist/external/**',
    // `./logger/logger` is aliased to `./logger/node` (with a browser-condition
    // override), so the platform-agnostic re-export leaf `dist/logger/logger.*`
    // ships but no export reaches it — the alias jumps over it. Excluded so the
    // validator doesn't flag the shadowed leaf. (Latent: the alias could be
    // dropped to let `logger.js` self-route, but that changes resolution — out
    // of scope for the generator migration.)
    'dist/logger/logger.d.ts',
    'dist/logger/logger.js',
    'src/**',
  ],
  nodeRange: '>=22',
  outDir: 'dist',
}
