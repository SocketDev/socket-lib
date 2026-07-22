/**
 * @file Rolldown configuration for the `prim` CLI bundle. Unlike the main
 *   socket-lib build (per-file transpile), this is a real bundle: every import
 *   — including `@socketsecurity/lib-stable/*` and `diff` — gets inlined into a
 *   single `dist/bin/prim.cjs`. The `@ultrathink/acorn.wasm` parser stays
 *   external: its CJS entry reads `${__dirname}/./acorn.wasm` synchronously at
 *   module load, so it is required as a `./acorn-wasm.cjs` sibling the build
 *   runner copies next to the bundle — `__dirname` at runtime resolves to
 *   `dist/bin/`, where both files sit. Output contract:
 *
 *   - `dist/bin/prim.cjs` — the bundled CLI
 *   - `dist/bin/acorn-wasm.cjs` — copied from the `@ultrathink/acorn.wasm`
 *     package
 *   - `dist/bin/acorn.wasm` — copied from the `@ultrathink/acorn.wasm` package
 *     The bin entry in `package.json` points at `dist/bin/prim.cjs`.
 */

import path from 'node:path'

import type { RolldownOptions } from 'rolldown'

// Repo root comes from the canonical paths module (1 path, 1 reference) — never
// hand-walked with `__dirname/../..`, which silently breaks when the file moves.
import { REPO_ROOT } from '../../scripts/fleet/paths.mts'

export const primBuildConfig: RolldownOptions = {
  // The wasm parser stays external so prim.cjs keeps a runtime
  // `require('@ultrathink/acorn.wasm')`; `output.paths` rewrites that to the
  // `./acorn-wasm.cjs` sibling the build runner copies into dist/bin, so its
  // `${__dirname}/./acorn.wasm` load resolves next to the bundle.
  external: ['@ultrathink/acorn.wasm'],
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
    paths: { '@ultrathink/acorn.wasm': './acorn-wasm.cjs' },
  },
  platform: 'node',
}
