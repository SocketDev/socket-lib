/**
 * @file Rolldown configuration for the `prim` CLI bundle. Unlike the main
 *   socket-lib build (per-file transpile), this is a real bundle: every import
 *   — including `@socketsecurity/lib-stable/*` and `diff` — gets inlined into a
 *   single `dist/bin/prim.cjs`. The vendored `acorn-wasm` wrapper is also
 *   inlined, but its CJS `acorn-bindgen.cjs` binding (which reads
 *   `${__dirname}/./acorn.wasm` synchronously at module load) stays external
 *   and is copied next to the bundle by the build runner, so `__dirname` at
 *   runtime resolves to `dist/bin/` where both files sit. Output contract:
 *
 *   - `dist/bin/prim.cjs` — the bundled CLI
 *   - `dist/bin/acorn-bindgen.cjs` — copied from vendor/acorn
 *   - `dist/bin/acorn.wasm` — copied from vendor/acorn The bin entry in
 *     `package.json` points at `dist/bin/prim.cjs`.
 */

import path from 'node:path'

import type { RolldownOptions } from 'rolldown'

// Repo root comes from the canonical paths module (1 path, 1 reference) — never
// hand-walked with `__dirname/../..`, which silently breaks when the file moves.
import { REPO_ROOT } from '../../scripts/fleet/paths.mts'

export const primBuildConfig: RolldownOptions = {
  // Inline everything from lib-stable + diff + acorn-wasm wrapper. The
  // only external dep is the wasm bindgen, which has to stay a runtime
  // `require('./acorn-bindgen.cjs')` so its `${__dirname}/./acorn.wasm`
  // sibling-load works after publish.
  external: ['./acorn-bindgen.cjs'],
  input: path.join(REPO_ROOT, 'tools/prim/bin/prim.mts'),
  output: {
    file: path.join(REPO_ROOT, 'dist/bin/prim.cjs'),
    format: 'cjs',
    // `codeSplitting: false` inlines all dynamic imports into the single
    // prim.cjs bundle — the rolldown 1.x replacement for the deprecated
    // `inlineDynamicImports: true` (both produce one bundle).
    codeSplitting: false,
    minify: false,
    banner: '"use strict";\n/* Socket Lib prim - bundled with rolldown */',
  },
  platform: 'node',
}
