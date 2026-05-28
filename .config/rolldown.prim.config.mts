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
 *   - `dist/bin/acorn-bindgen.cjs` — copied from vendor/acorn-wasm
 *   - `dist/bin/acorn.wasm` — copied from vendor/acorn-wasm The bin entry in
 *     `package.json` points at `dist/bin/prim.cjs`.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { RolldownOptions } from 'rolldown'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.join(__dirname, '..')

export const primBuildConfig: RolldownOptions = {
  input: path.join(rootPath, 'tools/prim/bin/prim.mts'),
  platform: 'node',
  // Inline everything from lib-stable + diff + acorn-wasm wrapper. The
  // only external dep is the wasm bindgen, which has to stay a runtime
  // `require('./acorn-bindgen.cjs')` so its `${__dirname}/./acorn.wasm`
  // sibling-load works after publish.
  external: ['./acorn-bindgen.cjs'],
  output: {
    file: path.join(rootPath, 'dist/bin/prim.cjs'),
    format: 'cjs',
    inlineDynamicImports: true,
    minify: false,
    banner: '"use strict";\n/* Socket Lib prim - bundled with rolldown */',
  },
}
