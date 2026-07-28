#!/usr/bin/env node
/*
 * @file Audit which `@socketsecurity/lib` export subpaths the fleet + wheelhouse
 *   actually import — AST-accurately, via the vendored acorn/wasm parser, not
 *   grep. Resolves the import shapes grep miscounts:
 *
 *   - re-exports (`export { x } from '@socketsecurity/lib/x'`), dynamic
 *     `import('@socketsecurity/lib/x')`, and `require('@socketsecurity/lib/x')`
 *     all NAME the subpath → counted as real usage;
 *   - a type-only namespace import (`import type * as x`) is erased at compile,
 *     so it counts as a plain reference, not a blind spot;
 *   - the only true BLIND SPOTS are a runtime namespace import (`import * as x`,
 *     uses an unknown subset of names) and a bare-root import (`from
 *     '@socketsecurity/lib'`, no subpath at all) — they reference the package
 *     without naming a subpath, so per-name dead-code analysis can't see
 *     through them. Classifies each export 3 ways: ADOPTED (a member repo
 *     imports it directly), CASCADE-ONLY (used only in the wheelhouse
 *     `template/`, shipped fleet-wide by the cascade — live, NOT removable),
 *     UNUSED (no reference). Also flags pass-through re-exports (a consumer
 *     forwarding a lib subpath through its own surface — a cleanup candidate).
 *     Renders the picture as terminal bars (see audit-api-usage/render.mts).
 *     Usage: node scripts/repo/audit-api-usage.mts [--json] [--consumers
 *     <dir,…>]
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

import { renderReport } from './audit-api-usage/render.mts'

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
// produced it (so the report can separate clean imports from blind spots) and
// where it came from: which consumer repo, and whether it is a cascade-source
// path (the wheelhouse `template/` tree, which SHIPS to every member — so a
// subpath used only there is live fleet-wide, not "directly adopted").
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
  readonly repo: string
  readonly cascadeSource: boolean
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

// True when a file lives in the wheelhouse cascade source (the `template/`
// tree), which the cascade ships to every member — usage there is fleet-wide,
// not a single repo's direct adoption.
export function isCascadeSource(repo: string, file: string): boolean {
  return repo === 'socket-wheelhouse' && /[/\\]template[/\\]/.test(file)
}

// AST-walk one file, returning every lib reference it makes (any shape).
export function collectRefs(
  source: string,
  file: string,
  repo: string,
): UsageRef[] {
  const refs: UsageRef[] = []
  const cascadeSource = isCascadeSource(repo, file)
  const add = (specifier: string, kind: UsageRef['kind']): void => {
    const subpath = libSubpathOf(specifier)
    if (subpath !== undefined) {
      refs.push({ subpath, kind, file, repo, cascadeSource })
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
      // are used — flag it distinctly from a plain named import. BUT a
      // type-only namespace import (`import type * as x`) is erased at compile
      // (no runtime surface, no tree-shaking impact), so it's NOT a blind spot
      // — treat it as a plain named ref. The acorn-wasm parser doesn't expose
      // `importKind`, so detect `import type` from the statement's source text.
      const specifiers =
        (node as { specifiers?: AcornNode[] | undefined }).specifiers ?? []
      const isNamespace = specifiers.some(
        s =>
          (s as { type?: string | undefined }).type ===
          'ImportNamespaceSpecifier',
      )
      const start = (node as { start?: number | undefined }).start ?? 0
      const isTypeOnly = /^import\s+type\b/.test(
        source.slice(start, start + 16),
      )
      add(
        spec,
        isNamespace && !isTypeOnly ? 'namespace-import' : 'named-import',
      )
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
      // oxlint-disable-next-line socket/no-source-sniffing -- fast-path pre-filter only; not inferring behavior — it skips files that cannot contain a lib specifier before the real AST walk in collectRefs
      if (!source.includes(PKG)) {
        continue
      }
      const parsed = tryParse(source)
      if (!parsed) {
        continue
      }
      allRefs.push(...collectRefs(source, file, repo))
    }
  }

  // A subpath is USED if any ref names it exactly. Only TWO kinds are genuine
  // blind spots — they reference the package WITHOUT naming a subpath's
  // members, so per-name dead-code analysis can't see through them:
  //   - namespace-import (`import * as x`) — uses an unknown subset of names
  //   - bare-root (`from '@socketsecurity/lib'`) — no subpath at all
  // A re-export (`export { x } from '…/foo'`), a dynamic `import('…/foo')`, and
  // a `require('…/foo')` all NAME the subpath, so they resolve cleanly — they
  // are real usage, not blind spots.
  const BLIND: ReadonlySet<UsageRef['kind']> = new Set([
    'bare-root',
    'namespace-import',
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

  // Per-subpath repo fan-out (which MEMBER repos import it directly) and the
  // cascade-only flag (used solely in the wheelhouse template/ tree).
  const reposBySubpath = new Map<string, Set<string>>()
  const cascadeOnlySet = new Set<string>()
  for (const [sub, refs] of refsBySubpath) {
    const directRepos = new Set<string>()
    let anyDirect = false
    for (let i = 0, { length } = refs; i < length; i += 1) {
      const r = refs[i]!
      if (r.cascadeSource) {
        continue
      }
      anyDirect = true
      directRepos.add(r.repo)
    }
    reposBySubpath.set(sub, directRepos)
    if (!anyDirect) {
      cascadeOnlySet.add(sub)
    }
  }

  // 3-way classification:
  //   adopted     — a MEMBER repo imports it directly (real downstream demand)
  //   cascadeOnly — used only in the wheelhouse template/ (shipped fleet-wide
  //                 by the cascade, but no member imports it itself)
  //   unused      — no reference anywhere
  const adopted = subpaths.filter(
    s => refsBySubpath.has(s) && !cascadeOnlySet.has(s),
  )
  const cascadeOnly = subpaths.filter(s => cascadeOnlySet.has(s))
  const unused = subpaths.filter(s => !refsBySubpath.has(s))
  const used = subpaths.filter(s => refsBySubpath.has(s))
  const blindSubpaths = used.filter(s =>
    (refsBySubpath.get(s) ?? []).every(r => BLIND.has(r.kind)),
  )
  const namespaceRefs = allRefs.filter(r => r.kind === 'namespace-import')
  const bareRootRefs = allRefs.filter(r => r.kind === 'bare-root')

  // Pass-through re-exports: a consumer `export { x } from '@socketsecurity/lib/x'`
  // that just forwards a lib subpath through its own surface. The subpath IS
  // used (counted as adopted), but the forwarding adds nothing — downstream
  // could import lib directly. A cleanup candidate (minimize). Keyed by
  // "<repo>: <file>:<subpath>" so the report can point at each site. The
  // wheelhouse template/ is excluded (its re-exports are intentional shims).
  const passThroughReExports = allRefs
    .filter(r => r.kind === 're-export' && !r.cascadeSource)
    .map(r => ({
      repo: r.repo,
      file: path.relative(path.join(PROJECTS_DIR, r.repo), r.file),
      subpath: r.subpath,
    }))

  if (json) {
    logger.log(
      JSON.stringify(
        {
          total: subpaths.length,
          adopted: adopted.length,
          cascadeOnly: cascadeOnly.length,
          unused: unused.length,
          adoptedList: adopted,
          cascadeOnlyList: cascadeOnly,
          unusedList: unused,
          reposBySubpath: Object.fromEntries(
            [...reposBySubpath].map(([k, v]) => [k, [...v].toSorted()]),
          ),
          blindSpotSubpaths: blindSubpaths,
          namespaceRefs: namespaceRefs.length,
          bareRootRefs: bareRootRefs.length,
          passThroughReExports,
        },
        null,
        2,
      ),
    )
    return 0
  }

  renderReport({
    subpaths,
    adopted,
    cascadeOnly,
    unused,
    consumers,
    reposBySubpath,
    cascadeOnlySet,
    blindSubpaths,
    namespaceRefs: namespaceRefs.length,
    bareRootRefs: bareRootRefs.length,
    passThroughReExports,
  })
  return 0
}

process.exitCode = main()
