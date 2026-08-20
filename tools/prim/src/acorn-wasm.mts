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

import { createRequire } from 'node:module'

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

const acornWasm = createRequire(import.meta.url)(
  '@ultrathink/acorn.rs.wasm',
) as AcornWasm

export const { parse, walk } = acornWasm
