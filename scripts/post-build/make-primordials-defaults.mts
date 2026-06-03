/**
 * @file Codegen for src/checks/primordials-defaults.ts — the canonical alias
 *   map + Node-internal-only set that `socket-lib check primordials` defaults
 *   to when a consumer's config doesn't override them. Source of truth: the
 *   `globals` npm package's globals.json. We pull the union of `builtin`
 *   (standard JS) + `node` (Node-runtime globals), filter to the identifiers
 *   socket-lib actually exports with a `Ctor` suffix (cross-referenced against
 *   src/primordials/*.ts), and emit a frozen Record<string, string> at codegen
 *   time so the runtime check doesn't need to bundle the 100KB globals.json
 *   itself. Why codegen instead of runtime import: `globals` is a devDependency
 *   (correct — consumers shouldn't pull it transitively just to run a
 *   primordials check), and the bundler runs at publish time, before consumer
 *   install. Embedding the derived map keeps the published bundle
 *   self-contained. Re-run whenever globals bumps, or src/primordials/ exports
 *   change. Wired into scripts/post-build.mts.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import globals from 'globals'

const logger = getDefaultLogger()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.resolve(__dirname, '..', '..')
const primordialsDir = path.join(rootPath, 'src', 'primordials')
const outputPath = path.join(
  rootPath,
  'src',
  'checks',
  'primordials-defaults.ts',
)

/**
 * Collect every `<name>Ctor` export across src/primordials/*.ts. The regex
 * matches `export const <name>Ctor` declarations; the result is the set of base
 * names (stripped `Ctor` suffix) that socket-lib mirrors with the Ctor
 * convention.
 */
function collectCtorBaseNames(): Set<string> {
  const baseNames = new Set<string>()
  const ctorRe = /^export const (\w+?)Ctor\b/gm
  for (const entry of readdirSync(primordialsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue
    }
    const source = readFileSync(path.join(primordialsDir, entry.name), 'utf8')
    let match: RegExpExecArray | null
    while ((match = ctorRe.exec(source)) !== null) {
      baseNames.add(match[1]!)
    }
  }
  return baseNames
}

/**
 * Build the alias-map target (`Global<Name>`) for a captured-global source
 * name. Strips a leading `global` so `globalThis` → `GlobalThis` (not
 * `GlobalGlobalThis`); otherwise title-cases the first letter. Embedded `DOM` /
 * `URI` / `URL` acronyms are normalized to `Dom` / `Uri` / `Url` so the alias
 * reads as a single TitleCase word (`encodeURIComponent` →
 * `GlobalEncodeUriComponent`, not `GlobalEncodeURIComponent`) — consistent with
 * TitleCase identifier style.
 */
function aliasTarget(sourceName: string): string {
  const stripped = sourceName.startsWith('global')
    ? sourceName.slice('global'.length)
    : sourceName
  const titled = `${stripped.charAt(0).toUpperCase()}${stripped.slice(1)}`
  const normalized = titled
    .replace(/DOM/g, 'Dom')
    .replace(/URI/g, 'Uri')
    .replace(/URL/g, 'Url')
  return `Global${normalized}`
}

/**
 * Collect every captured-global export across src/primordials/*.ts — the
 * bare-name exports of the shape `export const <name> = globalThis.<name>`
 * (plus the special `export { ... as globalThis }` re-export). Exports stay
 * under their natural JS names so the surface reads cleanly; downstream
 * consumers rename at import time via the alias map's `Global<Name>` target
 * (e.g. `import { atob as GlobalAtob }`).
 *
 * Returns a map of source name → alias-map target (`atob` → `GlobalAtob`).
 */
function collectGlobalAliases(): Map<string, string> {
  const aliases = new Map<string, string>()
  // Shape 1: `export const atob = globalThis.atob`
  const capturedRe = /^export const (\w+) = globalThis\.\w+/gm
  // Shape 2: `export { capturedGlobalThis as globalThis }` — the live
  // keyword can't be a direct `export const`, so this is the one
  // captured global that goes through a re-export.
  const renamedRe = /^export \{ \w+ as (\w+) \}/gm
  for (const entry of readdirSync(primordialsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue
    }
    const source = readFileSync(path.join(primordialsDir, entry.name), 'utf8')
    let match: RegExpExecArray | null
    while ((match = capturedRe.exec(source)) !== null) {
      aliases.set(match[1]!, aliasTarget(match[1]!))
    }
    while ((match = renamedRe.exec(source)) !== null) {
      aliases.set(match[1]!, aliasTarget(match[1]!))
    }
  }
  return aliases
}

function main(): void {
  const ctorBaseNames = collectCtorBaseNames()
  const globalAliases = collectGlobalAliases()
  const builtin = Object.keys(globals.builtin)
  const node = Object.keys(globals.node)
  const candidates = new Set<string>([...builtin, ...node])

  // Build the alias map: identifier → socket-lib's exported name.
  // Constructors use the `<name>Ctor` convention; non-constructor
  // globals use `Global<Name>`. Both source-of-truth sets are
  // discovered by scanning src/primordials/*.ts, so adding a new
  // export there automatically extends the default map on the next
  // codegen run.
  const aliasEntries: Array<[string, string]> = []
  for (const name of [...candidates].toSorted()) {
    if (ctorBaseNames.has(name)) {
      aliasEntries.push([name, `${name}Ctor`])
    } else if (globalAliases.has(name)) {
      aliasEntries.push([name, globalAliases.get(name)!])
    }
  }
  aliasEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  // Node-internal-only set — names that exist in Node's primordials
  // but socket-lib intentionally doesn't mirror. Hand-maintained;
  // codegen just emits the current list so it lives next to its
  // siblings.
  const nodeInternalOnly = [
    'DataViewPrototypeGetInt32',
    'DataViewPrototypeGetUint32',
    'SafeMap',
    'SafePromise',
    'SafePromiseAllReturnVoid',
    'SafePromiseAllSettled',
    'SafeSet',
    'SafeWeakMap',
    'SafeWeakSet',
  ]

  const banner = `/**
 * @file GENERATED — do not edit by hand. Run \`node scripts/post-build/make-primordials-defaults.mts\`
 *   (also runs as part of \`pnpm run build\`) to regenerate from the
 *   \`globals\` npm package's globals.json crossed against
 *   src/primordials/*.ts \`Ctor\` exports.
 *
 *   Source: globals@<bumped via taze>, env = builtin ∪ node.
 *   Filter: identifiers socket-lib exports as \`<name>Ctor\`.
 */
`

  const aliasObjLines = aliasEntries.map(
    ([src, target]) => `  ${JSON.stringify(src)}: ${JSON.stringify(target)},`,
  )
  const internalArrLines = nodeInternalOnly.map(
    name => `  ${JSON.stringify(name)},`,
  )

  const output = `${banner}
import { ObjectFreeze } from '../primordials/object'

/**
 * Fleet-canonical alias map: socket-lib mirrors standard JS + Node
 * globals with a \`Ctor\` suffix. Downstream repos that destructure
 * raw \`primordials\` use this map to resolve the source-side name to
 * socket-lib's export.
 */
export const DEFAULT_ALIAS_MAP: Readonly<Record<string, string>> =
  ObjectFreeze({
    __proto__: null,
${aliasObjLines.join('\n')}
  }) as unknown as Readonly<Record<string, string>>

/**
 * Names that exist in Node's internal \`primordials\` but are
 * intentionally NOT mirrored to socket-lib (mostly Safe* wrappers
 * and prototype-method aliases). Adding to this set is a per-name
 * decision; the list is hand-maintained.
 */
export const DEFAULT_NODE_INTERNAL_ONLY: readonly string[] = ObjectFreeze([
${internalArrLines.join('\n')}
]) as readonly string[]
`

  writeFileSync(outputPath, output)
  logger.log(
    `Wrote ${aliasEntries.length} alias entries + ${nodeInternalOnly.length} internal-only names to ${path.relative(rootPath, outputPath)}`,
  )
}

main()
