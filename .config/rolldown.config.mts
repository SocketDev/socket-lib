/**
 * @file Rolldown configuration for the socket-lib main build. Per-file
 *   transpile rather than a bundle: every `src/**\/*.{ts,mts,cts}` becomes a
 *   sibling `dist/**\/*.js` with inter-file `require()`s preserved, via
 *   `output.preserveModules`. Declarations come from tsgo, externals from the
 *   separate rolldown externals build. Output contract (must not change —
 *   downstream `require()`s depend on it): CJS, no minification, directory
 *   structure mirrored under `dist/`, `INLINED_LIB_VERSION` + `NODE_ENV`
 *   inlined. Rolldown emits `.js` specifiers for relative imports, so no
 *   source-extension post-pass is needed.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import fg from 'fast-glob'

import { envAsBoolean } from '@socketsecurity/lib-stable/env/boolean'

import type { RolldownOptions } from 'rolldown'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.join(__dirname, '..')
const rootPkgJson = JSON.parse(
  readFileSync(path.join(rootPath, 'package.json'), 'utf8'),
) as { version: string }
const srcPath = path.join(rootPath, 'src')
const distPath = path.join(rootPath, 'dist')

// Entry-point glob: every runtime source file, minus declaration files and
// the separately built vendored externals.
const entryFiles = fg.sync('**/*.{ts,mts,cts}', {
  cwd: srcPath,
  absolute: true,
  ignore: ['**/*.d.ts', '**/external/**'],
})

// preserveModules keys outputs off the input map; build an explicit map so
// each file lands at its mirrored dist path regardless of rolldown's chunk
// naming heuristics.
const input: Record<string, string> = {}
for (let i = 0, { length } = entryFiles; i < length; i += 1) {
  const abs = entryFiles[i]!
  const rel = path
    .relative(srcPath, abs)
    // Strip a trailing TypeScript extension — `.ts`, `.cts`, or `.mts`.
    .replace(/\.(?:c|m)?ts$/, '')
    .split(path.sep)
    .join('/')
  input[rel] = abs
}

const version = JSON.stringify(rootPkgJson.version)

export const buildConfig: RolldownOptions = {
  // Keep each source file as its own module with inter-file requires intact
  // (verified: rolldown does not inline siblings under preserveModules). The
  // `src/external/*` tree is built separately into CJS `module.exports = X`
  // bundles; externalize requires into it so rolldown emits a bare runtime
  // `require('../external/foo.js')` instead of resolving the source file and
  // rewriting consumers to `.default` (the source uses `module.exports =`, so
  // the injected `.default` would be undefined at runtime — externalizing
  // avoids that).
  external: (id: string, importer?: string | undefined) => {
    // Bare specifiers (deps) stay external — per-file transpile, consumers
    // install them.
    if (!id.startsWith('.') && !path.isAbsolute(id)) {
      return true
    }
    // THIS repo's `src/external/*` shims, matched by resolved path. A blanket
    // `external/`-segment test also matches a *dependency's* nested
    // `dist/external/*` (e.g. an inlined package vendoring its own externals),
    // externalizing modules that were meant to be bundled and emitting
    // relative requires into files that don't exist next to the output —
    // exactly the class of break that shipped socket-cli 1.1.151's
    // "Cannot find module 'form-data'". Scoping by resolved prefix keeps the
    // predicate to the tree it owns.
    const resolved = path.isAbsolute(id)
      ? id
      : importer
        ? path.resolve(path.dirname(importer), id)
        : undefined
    return (
      resolved !== undefined &&
      resolved.startsWith(path.join(srcPath, 'external') + path.sep)
    )
  },
  input,
  output: {
    banner: '"use strict";\n/* Socket Lib - Built with rolldown */',
    chunkFileNames: '[name].js',
    dir: distPath,
    entryFileNames: '[name].js',
    format: 'cjs',
    minify: false,
    preserveModules: true,
    preserveModulesRoot: srcPath,
    sourcemap: envAsBoolean(process.env['COVERAGE']),
  },
  platform: 'node',
  // oxc define lives under `transform` (top-level `define` is rejected by
  // rolldown 1.0.2). Values are already-quoted source text injected verbatim.
  // oxc normalizes the member-access shape, so the dotted key matches both
  // `process.env.X` and `process.env['X']` reads.
  transform: {
    define: {
      'process.env.INLINED_LIB_VERSION': version,
      'process.env.NODE_ENV': JSON.stringify(
        process.env['NODE_ENV'] || 'production',
      ),
    },
  },
}
