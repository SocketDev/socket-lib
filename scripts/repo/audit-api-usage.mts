#!/usr/bin/env node
/**
 * @file Audit which `@socketsecurity/lib` export subpaths the fleet + wheelhouse
 *   actually import — AST-accurately, via the vendored acorn/wasm parser, not
 *   grep. Grep over-reports "unused" because it can't see the BLIND SPOTS that
 *   hide real usage:
 *
 *   - namespace imports (`import * as lib from '@socketsecurity/lib/x'`) — the
 *     subpath IS used, but no member-access grep proves which names;
 *   - dynamic `import('@socketsecurity/lib/x')` (ImportExpression) and
 *     `require('@socketsecurity/lib/x')` (CallExpression);
 *   - re-export chains (`export * from '@socketsecurity/lib/x'`) — the subpath
 *     leaks transitively through a consumer's own surface;
 *   - bare-root imports (`from '@socketsecurity/lib'`) that pull the package
 *     index, reaching exports no subpath grep attributes. Reports three
 *     buckets: USED (an import/export/dynamic ref names the subpath), UNUSED
 *     (no consumer references it), and BLIND SPOTS (references that defeat
 *     per-name dead-code analysis — namespace/re-export/dynamic/bare). The
 *     blind-spot list is the honest caveat on the unused count: a subpath
 *     reached only through a blind spot is "used" but its named exports can't
 *     be proven live, and the unused count can't be trusted as "safe to remove"
 *     until the blind spots are accounted for. Usage: node
 *     scripts/repo/audit-api-usage.mts [--json] [--consumers <dir,…>]
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import {
  tryParse,
  walkSimple,
} from '../../.claude/hooks/fleet/_shared/acorn/index.mts'
import type { AcornNode } from '../../.claude/hooks/fleet/_shared/acorn/index.mts'

const logger = getDefaultLogger()

// The package whose exports we audit, and the bare specifiers consumers use to
// reach it (`-stable` is the canonical alias of the same package).
const PKG = '@socketsecurity/lib'
const PKG_STABLE = '@socketsecurity/lib-stable'

// Consumer repos live as siblings of socket-lib. Default set = every fleet repo
// that consumes the lib, plus the wheelhouse.
const PROJECTS_DIR = path.resolve(import.meta.dirname, '../../..')
const DEFAULT_CONSUMERS = [
  'socket-addon',
  'socket-bin',
  'socket-btm',
  'socket-cli',
  'socket-mcp',
  'socket-packageurl-js',
  'socket-registry',
  'socket-sdk-js',
  'socket-vscode',
  'socket-webext',
  'socket-wheelhouse',
]

const SOURCE_EXTS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])
const SKIP_DIRS = new Set(['.git', 'build', 'coverage', 'dist', 'node_modules'])

// A single reference to a lib subpath, tagged with the syntactic shape that
// produced it (so the report can separate clean imports from blind spots).
export interface UsageRef {
  readonly subpath: string
  readonly kind:
    | 'bare-root'
    | 'dynamic-import'
    | 'named-import'
    | 'namespace-import'
    | 're-export'
    | 'require'
  readonly file: string
}

// Strip a `@socketsecurity/lib[-stable]/<subpath>` specifier to its subpath, or
// `''` for the bare-root specifier. Returns undefined when the specifier is not
// a lib import at all.
export function libSubpathOf(specifier: string): string | undefined {
  for (const base of [PKG_STABLE, PKG]) {
    if (specifier === base) {
      return ''
    }
    if (specifier.startsWith(`${base}/`)) {
      return specifier.slice(base.length + 1)
    }
  }
  return undefined
}

// List every source file under a dir, skipping vendored / build / VCS trees.
export function listSourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (let i = 0, { length } = entries; i < length; i += 1) {
      const name = entries[i]!
      if (SKIP_DIRS.has(name)) {
        continue
      }
      const abs = path.join(dir, name)
      let st
      try {
        st = statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(abs)
      } else if (SOURCE_EXTS.has(path.extname(name))) {
        out.push(abs)
      }
    }
  }
  walk(root)
  return out
}

// Pull the string value out of an import/require source node (a Literal).
function literalValue(node: AcornNode | undefined): string | undefined {
  const n = node as
    | { type?: string | undefined; value?: unknown | undefined }
    | undefined
  if (n?.type === 'Literal' && typeof n.value === 'string') {
    return n.value
  }
  return undefined
}

// AST-walk one file, returning every lib reference it makes (any shape).
export function collectRefs(source: string, file: string): UsageRef[] {
  const refs: UsageRef[] = []
  const add = (specifier: string, kind: UsageRef['kind']): void => {
    const subpath = libSubpathOf(specifier)
    if (subpath !== undefined) {
      refs.push({ subpath, kind, file })
    }
  }
  walkSimple(source, {
    ImportDeclaration(node) {
      const spec = literalValue(
        (node as { source?: AcornNode | undefined }).source,
      )
      if (spec === undefined) {
        return
      }
      // A namespace import (`import * as x from …`) hides which named exports
      // are used — flag it distinctly from a plain named import.
      const specifiers =
        (node as { specifiers?: AcornNode[] | undefined }).specifiers ?? []
      const isNamespace = specifiers.some(
        s =>
          (s as { type?: string | undefined }).type ===
          'ImportNamespaceSpecifier',
      )
      add(spec, isNamespace ? 'namespace-import' : 'named-import')
    },
    ExportAllDeclaration(node) {
      const spec = literalValue(
        (node as { source?: AcornNode | undefined }).source,
      )
      if (spec !== undefined) {
        add(spec, 're-export')
      }
    },
    ExportNamedDeclaration(node) {
      // `export { x } from '@socketsecurity/lib/…'` — a re-export with a source.
      const spec = literalValue(
        (node as { source?: AcornNode | undefined }).source,
      )
      if (spec !== undefined) {
        add(spec, 're-export')
      }
    },
    ImportExpression(node) {
      const spec = literalValue(
        (node as { source?: AcornNode | undefined }).source,
      )
      if (spec !== undefined) {
        add(spec, 'dynamic-import')
      }
    },
    CallExpression(node) {
      // `require('@socketsecurity/lib/…')`.
      const callee = (
        node as {
          callee?:
            | { type?: string | undefined; name?: string | undefined }
            | undefined
        }
      ).callee
      if (callee?.type === 'Identifier' && callee.name === 'require') {
        const args =
          (node as { arguments?: AcornNode[] | undefined }).arguments ?? []
        const spec = literalValue(args[0])
        if (spec !== undefined) {
          add(spec, 'require')
        }
      }
    },
  })
  return refs
}

// The set of export subpaths socket-lib publishes (sans `.` and `./package*`).
export function exportSubpaths(libPkgJsonPath: string): string[] {
  const pkg = JSON.parse(readFileSync(libPkgJsonPath, 'utf8')) as {
    exports?: Record<string, unknown> | undefined
  }
  const exp = pkg.exports ?? {}
  return Object.keys(exp)
    .filter(k => k !== '.' && !k.startsWith('./package'))
    .map(k => k.replace(/^\.\//, ''))
    .toSorted()
}

function main(): number {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')
  const consumersArg = argv[argv.indexOf('--consumers') + 1]
  const consumers =
    argv.includes('--consumers') && consumersArg
      ? consumersArg.split(',')
      : DEFAULT_CONSUMERS

  const libRoot = path.resolve(import.meta.dirname, '../..')
  const subpaths = exportSubpaths(path.join(libRoot, 'package.json'))

  // Walk every consumer, collecting refs (skip socket-lib's own tree).
  const allRefs: UsageRef[] = []
  for (
    let i = 0, { length } = consumers.length ? consumers : [];
    i < length;
    i += 1
  ) {
    const repo = consumers[i]!
    const root = path.join(PROJECTS_DIR, repo)
    if (!existsSync(root)) {
      logger.warn(`skip (absent): ${repo}`)
      continue
    }
    const files = listSourceFiles(root)
    for (let j = 0, flen = files.length; j < flen; j += 1) {
      const file = files[j]!
      const source = readFileSync(file, 'utf8')
      if (!source.includes(PKG)) {
        continue
      }
      const parsed = tryParse(source)
      if (!parsed) {
        continue
      }
      allRefs.push(...collectRefs(source, file))
    }
  }

  // A subpath is USED if any ref names it exactly. Blind-spot KINDS
  // (namespace / re-export / dynamic / require / bare-root) mean named-export
  // dead-code analysis can't see through them.
  const BLIND: ReadonlySet<UsageRef['kind']> = new Set([
    'bare-root',
    'dynamic-import',
    'namespace-import',
    're-export',
    'require',
  ])
  const refsBySubpath = new Map<string, UsageRef[]>()
  for (let i = 0, { length } = allRefs; i < length; i += 1) {
    const r = allRefs[i]!
    const list = refsBySubpath.get(r.subpath)
    if (list) {
      list.push(r)
    } else {
      refsBySubpath.set(r.subpath, [r])
    }
  }

  const used = subpaths.filter(s => refsBySubpath.has(s))
  const unused = subpaths.filter(s => !refsBySubpath.has(s))
  // Blind spots: subpaths reached ONLY through a blind-spot kind (no plain
  // named import), plus bare-root refs (which reach an unattributed surface).
  const blindSubpaths = used.filter(s =>
    (refsBySubpath.get(s) ?? []).every(r => BLIND.has(r.kind)),
  )
  const bareRootRefs = allRefs.filter(r => r.kind === 'bare-root')
  const namespaceRefs = allRefs.filter(r => r.kind === 'namespace-import')
  const reExportRefs = allRefs.filter(r => r.kind === 're-export')

  if (json) {
    logger.log(
      JSON.stringify(
        {
          total: subpaths.length,
          used: used.length,
          unused: unused.length,
          unusedList: unused,
          blindSpotSubpaths: blindSubpaths,
          bareRootRefs: bareRootRefs.length,
          namespaceRefs: namespaceRefs.length,
          reExportRefs: reExportRefs.length,
        },
        null,
        2,
      ),
    )
    return 0
  }

  const pct = (n: number): string =>
    `${Math.round((n / subpaths.length) * 100)}%`
  logger.log(`socket-lib API usage across ${consumers.length} consumers`)
  logger.log('')
  logger.log(`  total export subpaths : ${subpaths.length}`)
  logger.log(`  used                  : ${used.length} (${pct(used.length)})`)
  logger.log(
    `  unused                : ${unused.length} (${pct(unused.length)})`,
  )
  logger.log('')
  logger.log('  blind spots (defeat per-name dead-code analysis):')
  logger.log(`    namespace imports   : ${namespaceRefs.length} ref(s)`)
  logger.log(`    re-exports          : ${reExportRefs.length} ref(s)`)
  logger.log(`    bare-root imports   : ${bareRootRefs.length} ref(s)`)
  logger.log(
    `    subpaths reached ONLY via a blind spot : ${blindSubpaths.length}`,
  )
  logger.log('')
  logger.log('  unused subpaths (no consumer reference, by area):')
  const byArea = new Map<string, number>()
  for (let i = 0, { length } = unused; i < length; i += 1) {
    const area = unused[i]!.split('/')[0]!
    byArea.set(area, (byArea.get(area) ?? 0) + 1)
  }
  const areas = [...byArea.entries()].toSorted((a, b) => b[1] - a[1])
  for (let i = 0, { length } = areas; i < length; i += 1) {
    logger.log(`    ${areas[i]![0]} : ${areas[i]![1]}`)
  }
  return 0
}

process.exitCode = main()
