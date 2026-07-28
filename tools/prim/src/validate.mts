/**
 * @file Cross-batch validation for `prim mod`. After the codemod computes a
 *   per-file plan (new content + new imports), THIS module walks the plan to
 *   catch problems that no single-file rewrite can see:
 *
 *   - **Self-imports**: `primordials/number.ts` rewritten to `import {
 *     NumberParseInt } from './number'`. Single-file-checks accept it; the
 *     module fails to load at runtime.
 *   - **Cross-leaf cycles within primordials**: `primordials/array.ts` → imports
 *     `MapCtor` from `./map-set` which transitively imports back. Breaks `pnpm
 *     install`'s `prepare` phase.
 *   - **Unparseable output**: a botched rewrite shifted offsets and produced a
 *     syntactically invalid file. Cheap node-builtin parser catches it before
 *     ship. The validator runs BEFORE any disk writes happen. Failures abort
 *     the whole apply pass — partial-rewrite working trees are the worst
 *     failure mode the tool can produce (40 dirty files, half broken, manual
 *     `git checkout` to recover). Uses `@socketsecurity/lib-stable/shell/parse`
 *     patterns + `node:fs` (lib's readFileUtf8 is async; the prim tool is
 *     sync). All paths are normalized via
 *     `@socketsecurity/lib-stable/paths/normalize` for cross-platform string
 *     containment checks.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { parse } from '@ultrathink/acorn.wasm'
import { stripTypeScriptTypes } from 'node:module'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

/**
 * Detect import cycles introduced (or made worse) by the planned rewrites.
 *
 * Algorithm:
 *
 * 1. Build a module graph rooted at every planned file. Each node is a normalized,
 *    extension-stripped absolute path. Edges are relative- specifier imports
 *    resolved against the importer's directory.
 * 2. For nodes that ARE plans, use `plan.newSource` as the source-of-truth (the
 *    post-rewrite view). For other nodes referenced via edges, read the file on
 *    disk + parse. Files that don't exist or fail to parse contribute no
 *    outgoing edges (the cycle search continues past them).
 * 3. Run DFS from each plan node. Track a recursion stack of `(node, edge
 *    specifier)` tuples. A revisit of any node currently on the stack means we
 *    found a back-edge → cycle. Walk the stack to recover the path, surface it
 *    as `detail`.
 * 4. Cap the cycle-finding count per plan at 1 — we only need to report each
 *    introduced cycle once, not every back-edge that participates in it.
 *
 * Why this matters: today's `primordials/array.ts` → `./map-set` → `./array`
 * cycle would have been caught. The single-file self-import detector only sees
 * `array.ts` → `./array`, not the indirect path through `map-set`.
 *
 * Performance: visited-set + memoized parse cache keeps the walk O(N+E) where N
 * is the total reachable file count and E is the import-edge count. Plans are
 * walked sequentially but parse results cache across them.
 */
export function detectImportCycles(
  plans: readonly PlannedRewrite[],
): readonly ValidationFinding[] {
  if (plans.length === 0) {
    return []
  }
  // Plans, keyed by normalized + ext-stripped absolute path. The map is the
  // override layer: when DFS visits one of these nodes, we use the planned
  // newSource instead of reading from disk.
  const planByNode = new Map<string, PlannedRewrite>()
  for (let i = 0, { length } = plans; i < length; i += 1) {
    const plan = plans[i]!
    planByNode.set(nodeKey(plan.absPath), plan)
  }
  // Memoize per-node outgoing-edge lookup. Saves rereading + reparsing files
  // referenced by multiple plans (the primordials/ leaves all import
  // ./uncurry, for example).
  const edgeCache = new Map<string, readonly string[]>()
  const findings: ValidationFinding[] = []
  for (let i = 0, { length } = plans; i < length; i += 1) {
    const plan = plans[i]!
    const startNode = nodeKey(plan.absPath)
    const startAbs = nodeAbsForKey(startNode, plan.absPath)
    const stack: Array<{
      node: string
      abs: string
      via?: string | undefined
    }> = []
    const onStack = new Set<string>()
    const visited = new Set<string>()
    const cycle = dfsForCycle(
      startNode,
      startAbs,
      planByNode,
      edgeCache,
      stack,
      onStack,
      visited,
    )
    if (cycle) {
      findings.push({
        kind: 'cycle',
        file: plan.relPath,
        message: 'rewrite introduced or extended an import cycle',
        detail: `cycle path: ${cycle.join(' → ')}`,
      })
    }
  }
  return findings
}

/**
 * Iterative DFS for a back-edge into the recursion stack. Returns the cycle
 * path (sequence of node keys ending at the back-edge target) or undefined if
 * no cycle is found from this start.
 *
 * Iterative (not recursive) because deep graphs would blow the call stack on
 * pathological inputs. The state per frame is the node, its abs path, and an
 * index into its outgoing-edges list.
 */
export function dfsForCycle(
  start: string,
  startAbs: string,
  planByNode: ReadonlyMap<string, PlannedRewrite>,
  edgeCache: Map<string, readonly string[]>,
  stack: Array<{ node: string; abs: string; via?: string | undefined }>,
  onStack: Set<string>,
  visited: Set<string>,
): readonly string[] | undefined {
  // Each frame: { node, abs, edges, edgeIndex }. We push on enter and pop
  // on exit. `via` (in the stack array passed by caller) records the
  // specifier that led to this node, used to render the cycle path.
  type Frame = {
    node: string
    abs: string
    edges: readonly string[]
    edgeIndex: number
  }
  const frames: Frame[] = []
  const enter = (node: string, abs: string): void => {
    const edges = getOutgoingEdges(node, abs, planByNode, edgeCache)
    frames.push({ node, abs, edges, edgeIndex: 0 })
    stack.push({ node, abs })
    onStack.add(node)
    visited.add(node)
  }
  const leave = (): void => {
    const frame = frames.pop()
    if (frame) {
      onStack.delete(frame.node)
      stack.pop()
    }
  }
  enter(start, startAbs)
  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!
    if (frame.edgeIndex >= frame.edges.length) {
      leave()
      continue
    }
    const target = frame.edges[frame.edgeIndex]!
    frame.edgeIndex += 1
    if (onStack.has(target)) {
      // Back-edge → cycle. Walk the stack from the back-edge target to the
      // current node + close it with the target again. The result is a
      // human-readable path like `array → map-set → array`.
      const cyclePath: string[] = []
      let started = false
      for (let i = 0, { length } = stack; i < length; i += 1) {
        const entry = stack[i]!
        if (entry.node === target) {
          started = true
        }
        if (started) {
          cyclePath.push(shortenForReport(entry.node))
        }
      }
      cyclePath.push(shortenForReport(target))
      return cyclePath
    }
    if (visited.has(target)) {
      // Already fully explored from a sibling path; safe to skip.
      continue
    }
    const targetAbs = nodeAbsForKey(target, target)
    enter(target, targetAbs)
  }
  return undefined
}

/**
 * Parse a TS/JS source string and return every relative `from` specifier in its
 * `import` declarations. Throws on parse errors. Strips TypeScript types first
 * (mode: 'strip') so positions stay aligned with the raw source.
 */
export function extractImports(
  source: string,
  absPath: string,
): readonly string[] {
  const ext = path.extname(absPath)
  const isTs =
    ext === '.cts' || ext === '.mts' || ext === '.ts' || ext === '.tsx'
  const parseSrc = isTs
    ? stripTypeScriptTypes(source, { mode: 'strip' })
    : source
  const ast = parse(parseSrc, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: false,
    ranges: false,
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: true,
    allowHashBang: true,
  }) as {
    body: ReadonlyArray<{
      type: string
      source?: { value?: unknown | undefined } | undefined
    }>
  }
  const specs: string[] = []
  for (let i = 0, { length } = ast.body; i < length; i += 1) {
    const node = ast.body[i]
    if (
      node &&
      (node.type === 'ExportAllDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ImportDeclaration') &&
      node.source &&
      typeof node.source.value === 'string'
    ) {
      specs.push(node.source.value)
    }
  }
  return specs
}

/**
 * Format a validation report for human reading. Used by the CLI when the batch
 * is rejected.
 */
export function formatValidationReport(
  findings: readonly ValidationFinding[],
): string {
  if (findings.length === 0) {
    return ''
  }
  const lines = [
    `prim mod: validation rejected ${findings.length} planned rewrite(s):`,
    '',
  ]
  for (let i = 0, { length } = findings; i < length; i += 1) {
    const f = findings[i]!
    lines.push(`  [${f.kind}] ${f.file}`)
    lines.push(`    ${f.message}`)
    if (f.detail) {
      lines.push(`    ${f.detail}`)
    }
    lines.push('')
  }
  lines.push(
    'No files were modified. Re-run with --no-validate to skip these checks',
  )
  lines.push('(only when you know the rewrite is safe).')
  return lines.join('\n')
}

/**
 * Compute the outgoing edges of a node — the relative imports it declares. For
 * nodes that match a plan, use the plan's `newSource`. For other nodes, read
 * the file on disk. Memoized via `edgeCache`.
 *
 * Returns an array of `{ targetNode, specifier }` entries. Non-relative
 * specifiers (`node:fs`, `@socketsecurity/lib-stable/...`) contribute no edges
 * — they're external to the local graph.
 */
export function getOutgoingEdges(
  node: string,
  abs: string,
  planByNode: ReadonlyMap<string, PlannedRewrite>,
  edgeCache: Map<string, readonly string[]>,
): readonly string[] {
  const cached = edgeCache.get(node)
  if (cached) {
    return cached
  }
  let source: string | undefined
  const plan = planByNode.get(node)
  if (plan) {
    source = plan.newSource
  } else {
    try {
      source = readFileSync(abs, 'utf8')
    } catch {
      // Missing or unreadable file → no outgoing edges. The cycle search
      // continues; we just don't follow into a phantom node.
      edgeCache.set(node, [])
      return []
    }
  }
  let imports: readonly string[]
  try {
    imports = extractImports(source, abs)
  } catch {
    edgeCache.set(node, [])
    return []
  }
  const dir = path.dirname(abs)
  const targets: string[] = []
  for (let i = 0, { length } = imports; i < length; i += 1) {
    const spec = imports[i]!
    if (!isRelativeSpecifier(spec)) {
      continue
    }
    const resolved = path.resolve(dir, spec)
    targets.push(stripExt(normalizePath(resolved)))
  }
  edgeCache.set(node, targets)
  return targets
}

export function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../')
}

/**
 * Recover a usable absolute path for a node key. The DFS visits nodes by key
 * (ext-stripped) but needs the actual on-disk path to read source. We probe the
 * same set of extensions used elsewhere; first one that exists wins.
 *
 * `hint` is the original path (with ext) for the starting plan — used as the
 * preferred answer when the key matches.
 */
export function nodeAbsForKey(node: string, hint: string): string {
  if (stripExt(normalizePath(hint)) === node) {
    return hint
  }
  // Try common TS/JS extensions in order.
  const exts = ['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']
  for (let i = 0, { length } = exts; i < length; i += 1) {
    const candidate = `${node}${exts[i]}`
    if (existsSync(candidate)) {
      return candidate
    }
  }
  // Fall back to bare key (caller's readFileSync will throw, caught by the
  // edge lookup, contributing no outgoing edges).
  return node
}

/**
 * Build the module-graph node key for an absolute path. Two forms of the same
 * file (`./foo`, `./foo.ts`) must collapse to one node, so we strip the
 * extension. Also normalize to forward-slash so Windows + posix agree.
 */
export function nodeKey(absPath: string): string {
  return stripExt(normalizePath(absPath))
}

/**
 * Render a node key as a short relative-style path for the cycle report. The
 * full absolute path is noisy; the basename plus its parent dir is enough to
 * identify the file in context.
 */
export function shortenForReport(node: string): string {
  const parts = node.split('/')
  if (parts.length <= 2) {
    return node
  }
  return parts.slice(-2).join('/')
}

export function stripExt(p: string): string {
  return p.replace(/\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/, '')
}

/**
 * One planned file change from the codemod's compute phase. The `newSource` is
 * the fully-rewritten content, ready to be written if validation passes.
 */
export interface PlannedRewrite {
  /**
   * Absolute path on disk.
   */
  readonly absPath: string
  /**
   * Repo-root-relative path, for error reporting.
   */
  readonly relPath: string
  /**
   * Full new content of the file after rewrites.
   */
  readonly newSource: string
}

/**
 * A validation problem the codemod can't see in single-file mode. Each finding
 * names the offending file, the kind of problem, and a remediation hint. The
 * caller (cli.mts) aggregates these into a report and aborts the apply pass.
 */
export interface ValidationFinding {
  readonly kind:
    | 'self-import'
    | 'cycle'
    | 'unparseable'
    | 'inside-primordials-root'
  readonly file: string
  readonly message: string
  /**
   * Extra detail surfaced to the user — e.g. the cycle path.
   */
  readonly detail?: string | undefined
}

/**
 * Run cross-batch validation on a set of planned rewrites. Returns an empty
 * array on success; a non-empty array means the apply should abort.
 *
 * `primordialsRoot` (optional, absolute, normalized to forward slashes) is the
 * directory containing per-leaf primordials files. Used to recognize the
 * source-of-truth files that should never be rewritten.
 */
export function validateRewrites(
  plans: readonly PlannedRewrite[],
  options: {
    primordialsRoot?: string | undefined
  } = {},
): readonly ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const normalizedRoot = options.primordialsRoot
    ? `${normalizePath(options.primordialsRoot)}/`
    : undefined
  for (let i = 0, { length } = plans; i < length; i += 1) {
    const plan = plans[i]!
    // Source-of-truth check: any rewrite INSIDE the primordials root is a
    // bug. The compute phase should have skipped these; if one snuck
    // through, abort the whole batch rather than corrupt the surface.
    if (
      normalizedRoot &&
      normalizePath(plan.absPath).startsWith(normalizedRoot)
    ) {
      findings.push({
        kind: 'inside-primordials-root',
        file: plan.relPath,
        message:
          'rewrite would touch a file inside the primordials source-of-truth root',
        detail: `primordials root: ${normalizedRoot}`,
      })
      continue
    }
    // Parse the rewritten file's imports. Reject if the output is
    // syntactically invalid — fail fast before checking anything else.
    let imports: readonly string[]
    try {
      imports = extractImports(plan.newSource, plan.absPath)
    } catch (e) {
      findings.push({
        kind: 'unparseable',
        file: plan.relPath,
        message: 'rewritten file failed to parse',
        detail: (e as Error).message,
      })
      continue
    }
    // Self-import check: an import whose specifier resolves to the same
    // file as the importer.
    const fileNoExt = stripExt(plan.absPath)
    for (let j = 0, { length: il } = imports; j < il; j += 1) {
      const spec = imports[j]!
      if (!isRelativeSpecifier(spec)) {
        continue
      }
      const resolved = stripExt(
        normalizePath(path.resolve(path.dirname(plan.absPath), spec)),
      )
      if (resolved === normalizePath(fileNoExt)) {
        findings.push({
          kind: 'self-import',
          file: plan.relPath,
          message: 'rewrite added a self-import',
          detail: `specifier: '${spec}'`,
        })
      }
    }
  }
  // Multi-hop cycle detection runs ACROSS the plan set. Even when no single
  // file self-imports, a chain like `array.ts → ./map-set → ./array` is a
  // load-order break. The walk is memoized so plans referencing common
  // dependencies (every primordials/ leaf imports ./uncurry) only pay the
  // parse cost once.
  const cycleFindings = detectImportCycles(plans)
  for (let i = 0, { length } = cycleFindings; i < length; i += 1) {
    findings.push(cycleFindings[i]!)
  }
  return findings
}
