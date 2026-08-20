/**
 * @file Rolldown configuration for the `prim` CLI bundle. Unlike the main
 *   socket-lib build, which transpiles per file, this is a real bundle: every
 *   import, including `@socketsecurity/lib-stable/*` and `diff`, is inlined
 *   into a single `dist/bin/prim.cjs`. The `@ultrathink/acorn.rs.wasm` parser
 *   is the exception, and it is not handled here: its CJS entry reads
 *   `${__dirname}/./acorn.wasm` synchronously at module load, so the build
 *   runner copies both files next to the bundle and
 *   `tools/prim/src/acorn-wasm.mts` requires the sibling at runtime. A bundler
 *   rewrite cannot do that job: `output.paths` only rewrites a static import's
 *   specifier, and the accessor's `createRequire` call is opaque to it. Output
 *   contract:
 *
 *   - `dist/bin/prim.cjs` — the bundled CLI
 *   - `dist/bin/acorn-wasm.cjs` — copied from the `@ultrathink/acorn.rs.wasm`
 *     package
 *   - `dist/bin/acorn.wasm` — copied from the `@ultrathink/acorn.rs.wasm` package
 *     The bin entry in `package.json` points at `dist/bin/prim.cjs`.
 */

import path from 'node:path'

import type { RolldownOptions } from 'rolldown'

// Repo root comes from the canonical paths module (1 path, 1 reference) — never
// hand-walked with `__dirname/../..`, which silently breaks when the file moves.
import { REPO_ROOT } from '../../scripts/fleet/paths.mts'

export const primBuildConfig: RolldownOptions = {
  input: path.join(REPO_ROOT, 'tools/prim/bin/prim.mts'),
  output: {
    file: path.join(REPO_ROOT, 'dist/bin/prim.cjs'),
    format: 'cjs',
    // `codeSplitting: false` inlines all dynamic imports into the single
    // prim.cjs bundle — the rolldown 1.x replacement for the deprecated
    // `inlineDynamicImports: true`. Both settings produce one bundle.
    codeSplitting: false,
    minify: false,
    banner: '"use strict";\n/* Socket Lib prim - bundled with rolldown */',
  },
  platform: 'node',
}
