/**
 * @fileoverview Post-bundle transform that rewrites bundled CJS externals
 * to call socket-lib's primordials surface instead of mutable globals.
 *
 * Pipeline:
 *   esbuild produces dist/external/*.js (CJS bundles)
 *     → this transform parses each bundle, finds well-known global call
 *       sites (Buffer.from, Date.now, Object.keys, …), rewrites them to
 *       primordial-shaped calls, and prepends a CJS require pulling the
 *       primordials it needs from a relative path
 *     → the resulting bundle no longer depends on globals being intact;
 *       prototype-pollution attacks against the caller realm can't
 *       redirect the bundled package's behavior.
 *
 * The work is delegated to `applyCodemod()` from tools/prim, the same
 * codemod the standalone `prim mod` CLI uses on src/. We hand it an
 * `importStyle: { kind: 'cjs', specifier: <per-file-relative-path> }`
 * so the inserted statement is a CJS `const { … } = require(…)` rather
 * than the ESM `import { … } from …` default.
 *
 * The relative-path computation per file is the only piece this module
 * owns: dist/external/foo.js needs `../primordials.js`, but
 * dist/external/@npmcli/x/y.js needs `../../../primordials.js`. The
 * codemod's specifier-as-function form covers that — see
 * tools/prim/src/codemod.mts ImportStyle.
 *
 * STATUS — gated behind SOCKET_LIB_PRIMORDIALS_TRANSFORM=1
 *
 * Off by default in the orchestrator until the underlying acorn-wasm
 * parser bug is fixed: on bundles ≥ ~3.6KB, the parser reports `end: 0`
 * (or other tiny stale values) for outer node types — Program,
 * ExpressionStatement, top-level VariableDeclaration, and crucially the
 * outer CallExpression nodes the codemod's prototype-rewrite path uses
 * to span the original `obj.method(args)` slice. Inner expression
 * positions (Identifier, MemberExpression, the args themselves) are
 * fine. The codemod's static-method path (Buffer.isBuffer → BufferIsBuffer)
 * relies on the outer CallExpression's end, so rewrites end up
 * truncating thousands of characters of source between the new call
 * site and a stale offset, producing files that fail to parse.
 *
 * Reproduces with vendor/acorn-wasm/acorn_wasm.cjs against any
 * dist/external bundle: parse → walk → outer node has `end: <small>`
 * while children have correct positions. Confirmed on tar-fs.js where
 * the first `Buffer.isBuffer(value)` call at byte 3624 has
 * `node.end: 589` (some unrelated offset earlier in the file).
 *
 * Re-enable once the acorn-wasm range-serialization is corrected. The
 * codemod-side correctness work is already in place: byte→char offset
 * translation (UTF-8 sources) and CJS-style require emission both
 * landed alongside this module.
 */

import path from 'node:path'

import { applyCodemod, loadPrimordialsSurface } from 'prim'

/**
 * Apply the primordials codemod to every JS file under `distExternalDir`.
 *
 * @param {string} distRoot          Absolute path to dist/.
 * @param {string} distExternalDir   Absolute path to dist/external/.
 * @param {object} [options]
 * @param {boolean} [options.quiet]
 * @returns {Promise<{ filesChanged: number; rewriteCount: number }>}
 */
export async function transformPrimordials(
  distRoot: string,
  distExternalDir: string,
  options: { quiet?: boolean } = {},
) {
  const { quiet = false } = options

  // The codemod needs to know which primordials we export so it doesn't
  // try to call out to identifiers we haven't actually exported. Read
  // the surface from src/primordials.ts (the ESM source) rather than
  // dist/primordials.js (esbuild-compiled with a `__export(obj, {…})`
  // form parseExports doesn't recognize). The runtime require still
  // points at dist/primordials.js — we just use the .ts source as a
  // catalog of names.
  const srcPrimordialsTs = path.join(distRoot, '..', 'src', 'primordials.ts')
  const surface = loadPrimordialsSurface(distRoot, srcPrimordialsTs)

  // Per-file specifier: walk up from the bundle to dist/, then down to
  // primordials.js. We strip a leading './' replacement because Node's
  // CJS resolver requires either an absolute path or one starting with
  // `./`/`../`; bare 'primordials.js' would trigger a node_modules
  // lookup. Forward-slash normalize for Windows.
  const runtimePrimordialsAbs = path.join(distRoot, 'primordials.js')
  const specifier = (absFile: string) => {
    const rel = path.relative(path.dirname(absFile), runtimePrimordialsAbs)
    const normalized = rel.split(path.sep).join('/')
    return normalized.startsWith('.') ? normalized : `./${normalized}`
  }

  const result = await applyCodemod({
    targetRoot: distRoot,
    scanDir: distExternalDir,
    exported: surface.exports,
    apply: true,
    includeGuessed: false,
    importStyle: { kind: 'cjs', specifier },
  })

  if (!quiet && result.filesChanged > 0) {
    process.stdout.write(
      `  primordials transform: ${result.rewriteCount} rewrite(s) ` +
        `across ${result.filesChanged} file(s)\n`,
    )
  }

  return {
    filesChanged: result.filesChanged,
    rewriteCount: result.rewriteCount,
  }
}
