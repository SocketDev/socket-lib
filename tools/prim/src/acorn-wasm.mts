/**
 * @file Typed accessor for `@ultrathink/acorn.rs.wasm`, the WASM acorn build
 *   prim parses with. The package ships no type declarations, so this is the
 *   single place that names the members prim uses — importing it directly
 *   makes every consumer an implicit `any`. The parser is CJS-only and loads
 *   its `.wasm` payload at require time, so it is reached through
 *   `createRequire` rather than a static ESM import. The AST it returns has no
 *   stable published shape, so `parse` returns `unknown` and each reader
 *   narrows the fields it needs.
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The package name, used when running from source in the repo.
export const ACORN_WASM_PACKAGE = '@ultrathink/acorn.rs.wasm'

// What the build copies beside the bundled CLI. `buildPrim` writes the
// package's CJS entry to dist/bin/acorn-wasm.cjs and its payload to
// dist/bin/acorn.wasm, and the published package ships only dist/.
export const ACORN_WASM_SIBLING_FILE = 'acorn-wasm.cjs'

/**
 * Parser options, e.g. `{ ecmaVersion: 'latest', sourceType: 'module' }`. The
 * parser accepts more keys than any one caller sets, so this stays open.
 */
export type AcornWasmOptions = Readonly<Record<string, unknown>>

/**
 * Visitor table the walk dispatches on, keyed by AST node type. Node shapes
 * differ per caller, so each caller types its own visitor parameters.
 */
export type AcornWasmVisitors = Readonly<Record<string, unknown>>

/**
 * The parser members prim uses.
 */
export interface AcornWasm {
  parse: (source: string, options: AcornWasmOptions) => unknown
  walk: (
    source: string,
    visitors: AcornWasmVisitors,
    options: AcornWasmOptions,
  ) => void
}

/**
 * What to require the parser from, given the URL of the module doing the
 * requiring.
 *
 * Two layouts have to work. Bundled, this module is inlined into
 * `dist/bin/prim.cjs` and the parser sits beside it as `acorn-wasm.cjs`, which
 * is the only copy the published package ships. From source there is no
 * sibling and the package resolves out of `tools/prim/node_modules`. Reading
 * the filesystem picks the right one at runtime, which a bundler rewrite
 * cannot do here: `output.paths` only rewrites a static import's specifier, and
 * a `createRequire` call is opaque to it.
 */
export function acornWasmSpecifier(moduleUrl: string): string {
  const sibling = path.join(
    path.dirname(fileURLToPath(moduleUrl)),
    ACORN_WASM_SIBLING_FILE,
  )
  return existsSync(sibling) ? sibling : ACORN_WASM_PACKAGE
}

const acornWasm = createRequire(import.meta.url)(
  acornWasmSpecifier(import.meta.url),
) as AcornWasm

export const { parse, walk } = acornWasm
