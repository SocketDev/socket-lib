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
 * The acorn-wasm parser has a known range-serialization bug: many node
 * kinds (CallExpression, VariableDeclaration, BlockStatement, Program,
 * MemberExpression, etc.) come back with `end` set to 0 or a stale
 * unrelated offset because compact_serialize.rs's `node.end()` falls
 * through to `(self.data >> 32) as u32` for any kind whose data field
 * stores a heap pointer or packed child IDs rather than an end
 * position. Inner expression positions (Identifier, Literal, etc.)
 * are correct.
 *
 * Workaround lives in tools/prim/src/codemod.mts:
 *   - `repairEndPositions(ast)` walks depth-first and for any node
 *     whose `end < max child end`, substitutes the descendant-derived
 *     value. Fixes MemberExpression, Identifier, etc. ends — enough
 *     for the static `Foo.bar(args) → FooBar(args)` rewrite path.
 *   - For the prototype `obj.method(args) → Primordial(obj, args)`
 *     path the codemod scans source forward from the last argument's
 *     end to find the matching `)` — see `findClosingParen()`.
 *
 * The transform now runs unconditionally as part of the externals
 * build. If the wasm parser is fixed upstream, both workarounds
 * become no-ops (correct ends pass through unchanged) and can be
 * removed.
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
  // the surface from src/primordials/ (the directory of ESM leaves
  // post-split) rather than dist/primordials/*.js (esbuild-compiled
  // with a `__export(obj, {…})` form parseExports doesn't recognize).
  // `loadPrimordialsSurface` concatenates every leaf in the directory
  // and parses the unified output as a single primordials surface.
  const srcPrimordialsDir = path.join(distRoot, '..', 'src', 'primordials')
  const surface = loadPrimordialsSurface(distRoot, srcPrimordialsDir)

  // Per-leaf specifier: walk up from the bundle to dist/, then down to
  // primordials/<leaf>.js. We strip a leading './' replacement because
  // Node's CJS resolver requires either an absolute path or one
  // starting with `./`/`../`; bare 'primordials/x.js' would trigger a
  // node_modules lookup. Forward-slash normalize for Windows.
  const leafSpecifier = (absFile: string, leaf: string) => {
    const target = path.join(distRoot, 'primordials', `${leaf}.js`)
    const rel = path.relative(path.dirname(absFile), target)
    const normalized = rel.split(path.sep).join('/')
    return normalized.startsWith('.') ? normalized : `./${normalized}`
  }

  // Alias the imported names so we never clash with identifiers the
  // bundle declares for itself. esbuild's CJS interop runtime
  // declares locals like `var ObjectDefineProperty = global.…` inside
  // some IIFEs; without aliasing, our top-level
  // `const { ObjectDefineProperty } = require(…)` would collide and
  // the file fails to load with "Identifier already been declared".
  const result = await applyCodemod({
    targetRoot: distRoot,
    scanDir: distExternalDir,
    exported: surface.exports,
    apply: true,
    includeGuessed: false,
    importStyle: {
      kind: 'cjs',
      // splitByLeaf is the active path; specifier is unused but
      // required by the type — pass a sentinel that would trip a
      // sanity check if accidentally used.
      specifier: () => '<unused: splitByLeaf is set>',
      aliasPrefix: '_p_',
      splitByLeaf: {
        exportToLeaf: surface.exportToLeaf,
        leafSpecifier,
      },
    },
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
