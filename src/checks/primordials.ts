/**
 * @fileoverview Primordials drift check — generic core.
 *
 * Each fleet repo that destructures from Node's internal `primordials`
 * global needs to keep its usage shape-aligned with socket-lib's
 * userland mirror (`@socketsecurity/lib/primordials`). This module is
 * the parser + diff engine; per-repo policy (which dirs to scan,
 * naming aliases, allowlist) lives in a config the caller supplies.
 *
 * Used by the `socket-lib check primordials` CLI subcommand. Kept
 * importable as a library so repos with bespoke needs can compose it
 * directly without going through the CLI.
 *
 * The flow:
 *
 *   1. Walk the configured `scanDirs` for `*.js` files.
 *   2. From each file, extract names from every
 *      `const { Foo, Bar } = primordials` destructure.
 *   3. Read socket-lib's `primordials.ts` (sibling clone) or
 *      `primordials.d.ts` (installed `node_modules`) and pull every
 *      exported name.
 *   4. Diff: every destructured name must be either (a) in socket-lib
 *      verbatim, (b) in socket-lib via the configured alias map, or
 *      (c) in the configured node-internal-only allowlist.
 *
 * Findings come back classified so callers can render or fail-CI on
 * specific kinds.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { joinOr } from '../arrays'

// ── Config ──────────────────────────────────────────────────────────

export interface PrimordialsCheckConfig {
  /**
   * Repo-relative directories to scan recursively for `*.js` files
   * containing `primordials` destructures. Each entry is resolved
   * against `repoRoot`.
   */
  readonly scanDirs: readonly string[]
  /**
   * Map from the source name a repo destructures (e.g. `Array`) to
   * the socket-lib export name it should resolve to (e.g.
   * `ArrayCtor`). socket-lib uses the `Ctor` suffix to avoid
   * shadowing globals; repos that need the original name go through
   * the alias.
   */
  readonly aliasMap: ReadonlyMap<string, string>
  /**
   * Names that exist only in Node's internal `primordials` and are
   * intentionally NOT mirrored to socket-lib. Adding to this set is
   * a deliberate decision per name.
   */
  readonly nodeInternalOnly: ReadonlySet<string>
  /**
   * Override the auto-resolution of socket-lib's primordials source.
   * Useful for tests; production callers should leave this undefined
   * so the resolver picks sibling clone → installed `node_modules`.
   */
  readonly socketLibPrimordialsPath?: string | undefined
  /**
   * Repo root used to resolve `scanDirs` and to anchor the
   * sibling-clone fallback (`<repoRoot>/../socket-lib/...`). Defaults
   * to `process.cwd()`.
   */
  readonly repoRoot?: string | undefined
}

// ── Findings ────────────────────────────────────────────────────────

export interface PrimordialsFinding {
  readonly kind: 'unmapped' | 'missing-from-socket-lib'
  readonly name: string
  readonly files: readonly string[]
  readonly hint: string
}

export interface PrimordialsCheckResult {
  readonly used: ReadonlySet<string>
  readonly usedToFiles: ReadonlyMap<string, readonly string[]>
  readonly socketLibNames: ReadonlySet<string>
  readonly findings: readonly PrimordialsFinding[]
}

// ── Source parsing ──────────────────────────────────────────────────

const NAME_HEAD_RE = /^([A-Za-z_$][A-Za-z0-9_$]*)/

/**
 * Strip `/* … *‍/` block comments and `//` line comments. Comments
 * inside primordials destructures would otherwise leak captured
 * names; stripping first keeps the regex simple.
 */
function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.replace(/^[\t ]*\/\/.*$/gm, '')
  out = out.replace(/[\t ]+\/\/.*$/gm, '')
  return out
}

/** Recursively collect every `*.js` file under `dir`. */
function collectJsFiles(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) {
    return out
  }
  const stack = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(cur)
    } catch {
      continue
    }
    for (const name of entries) {
      const full = path.join(cur, name)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        stack.push(full)
      } else if (stat.isFile() && full.endsWith('.js')) {
        out.push(full)
      }
    }
  }
  return out
}

/**
 * Pull every `const { … } = primordials` destructure body out of
 * `src`. Comments are stripped first so commentary inside a
 * destructure doesn't leak into captured names. The body regex
 * disallows nested `}`, which is safe after the comment-strip pass —
 * destructures themselves don't contain `}`.
 */
export function extractPrimordialsNames(src: string): string[] {
  const cleaned = stripComments(src)
  const re = /const\s*\{\s*([^}]*?)\}\s*=\s*primordials\b/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    for (const raw of m[1]!.split(',')) {
      const trimmed = raw.trim()
      if (!trimmed) {
        continue
      }
      // `Foo: BarAlias` keeps `Foo` (the source name on the LHS).
      const nameMatch = NAME_HEAD_RE.exec(trimmed)
      // nameMatch null arm fires on malformed export-list segments,
      // which tests don't simulate.
      /* c8 ignore start */
      if (nameMatch) {
        out.push(nameMatch[1]!)
      }
      /* c8 ignore stop */
    }
  }
  return out
}

/**
 * Pull every `export const Foo` / `export function Foo` /
 * `export { Foo }` from a TS file. Also matches `.d.ts` declaration
 * forms (`export declare const Foo`, `export declare function Foo`)
 * since the fallback path reads `primordials.d.ts` from
 * `node_modules` when no sibling clone is present.
 */
export function extractTsExports(src: string): string[] {
  const out = new Set<string>()
  for (const m of src.matchAll(
    /^export\s+(?:declare\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
  )) {
    out.add(m[1]!)
  }
  for (const m of src.matchAll(
    /^export\s+(?:declare\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
  )) {
    out.add(m[1]!)
  }
  for (const m of src.matchAll(/^export\s*\{\s*([^}]+)\}/gm)) {
    for (const raw of m[1]!.split(',')) {
      const trimmed = raw.trim()
      if (!trimmed) {
        continue
      }
      const nameMatch = NAME_HEAD_RE.exec(trimmed)
      // nameMatch null arm fires on malformed export-list segments,
      // which tests don't simulate.
      /* c8 ignore start */
      if (nameMatch) {
        out.add(nameMatch[1]!)
      }
      /* c8 ignore stop */
    }
  }
  return [...out]
}

// ── Resolver ────────────────────────────────────────────────────────

/**
 * Locate socket-lib's primordials source. Search order:
 *
 *   1. `config.socketLibPrimordialsPath` if explicitly set.
 *   2. Sibling clone — `<repoRoot>/../socket-lib/src/primordials.ts`.
 *      Preferred for the dev-loop case where a developer is editing
 *      socket-lib and a consumer in parallel.
 *   3. Installed copy — `<repoRoot>/node_modules/@socketsecurity/lib/
 *      dist/primordials.d.ts`. The CI fallback.
 *
 * Throws when none of the candidates exist.
 */
export function resolveSocketLibPrimordials(
  config: PrimordialsCheckConfig,
): string {
  // Each resolver branch (explicit path, sibling clone, installed
  // fallback) needs a specific test setup; the branch tracker reports
  // them sub-arms separately even when the primary path is hit.
  /* c8 ignore start */
  if (config.socketLibPrimordialsPath) {
    if (!existsSync(config.socketLibPrimordialsPath)) {
      throw new Error(
        `socketLibPrimordialsPath does not exist: ${config.socketLibPrimordialsPath}`,
      )
    }
    return config.socketLibPrimordialsPath
  }
  const repoRoot = config.repoRoot ?? process.cwd()
  const sibling = path.resolve(
    repoRoot,
    '..',
    'socket-lib',
    'src',
    'primordials.ts',
  )
  if (existsSync(sibling)) {
    return sibling
  }
  const installed = path.resolve(
    repoRoot,
    'node_modules',
    '@socketsecurity',
    'lib',
    'dist',
    'primordials.d.ts',
  )
  if (existsSync(installed)) {
    return installed
  }
  /* c8 ignore stop */
  throw new Error(
    'Cannot locate socket-lib primordials source. ' +
      `Looked at:\n  ${sibling}\n  ${installed}\n` +
      'Either clone socket-lib at ../socket-lib or run `pnpm install`.',
  )
}

// ── Check ───────────────────────────────────────────────────────────

/**
 * Run the primordials drift check against the configured repo.
 * Returns the full result including raw inputs (used names, lib
 * exports) so renderers can show context, plus a sorted list of
 * findings classified by kind.
 */
export function checkPrimordials(
  config: PrimordialsCheckConfig,
): PrimordialsCheckResult {
  const repoRoot = config.repoRoot ?? process.cwd()

  // Collect the repo's primordial names + which files use them.
  const used = new Set<string>()
  const usedToFiles = new Map<string, string[]>()

  for (const dir of config.scanDirs) {
    const fullDir = path.resolve(repoRoot, dir)
    const jsFiles = collectJsFiles(fullDir)
    for (const file of jsFiles) {
      let src: string
      try {
        src = readFileSync(file, 'utf8')
        // readFileSync rarely throws on files we just enumerated; the
        // includes()-false and names-empty arms fire only on files
        // that don't actually destructure primordials.
        /* c8 ignore start */
      } catch {
        continue
      }
      /* c8 ignore stop */
      if (!src.includes('primordials')) {
        continue
      }
      const names = extractPrimordialsNames(src)
      if (names.length === 0) {
        continue
      }
      const rel = path.relative(repoRoot, file)
      for (const name of names) {
        used.add(name)
        const arr = usedToFiles.get(name) ?? []
        if (!arr.includes(rel)) {
          arr.push(rel)
        }
        usedToFiles.set(name, arr)
      }
    }
  }

  // Read socket-lib's exported names.
  const socketLibPath = resolveSocketLibPrimordials(config)
  const socketLibNames = new Set(
    extractTsExports(readFileSync(socketLibPath, 'utf8')),
  )

  // Diff.
  const findings: PrimordialsFinding[] = []
  for (const name of [...used].sort()) {
    if (config.nodeInternalOnly.has(name)) {
      continue
    }
    if (socketLibNames.has(name)) {
      continue
    }
    const aliased = config.aliasMap.get(name)
    // Aliased + missing/present sub-arms exercised in tests, but the
    // `usedToFiles.get(name) ?? []` defensive fallback fires only when
    // a name is in `used` but not `usedToFiles` (impossible by
    // construction).
    /* c8 ignore start */
    if (aliased) {
      if (socketLibNames.has(aliased)) {
        continue
      }
      findings.push({
        kind: 'missing-from-socket-lib',
        name,
        files: usedToFiles.get(name) ?? [],
        hint:
          `\`${name}\` is mapped to socket-lib's \`${aliased}\`, but ` +
          `\`${aliased}\` is not exported. Add \`export const ${aliased} = ${name}\` ` +
          'to socket-lib/src/primordials.ts.',
      })
      continue
    }
    /* c8 ignore stop */
    findings.push({
      kind: 'unmapped',
      name,
      files: usedToFiles.get(name) ?? [],
      hint:
        `\`${name}\` is destructured from \`primordials\` but no ` +
        `socket-lib mapping exists. Pick one: ` +
        joinOr([
          `add \`${name}\` to socket-lib/src/primordials.ts`,
          `add a \`${name}\` → \`<libName>\` entry to the alias map`,
          `add \`${name}\` to nodeInternalOnly (if Node-internal only)`,
        ]) +
        '.',
    })
  }

  return {
    used,
    usedToFiles,
    socketLibNames,
    findings,
  }
}
