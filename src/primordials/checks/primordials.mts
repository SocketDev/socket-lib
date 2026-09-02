/**
 * @file Primordials drift check — generic core. Each Socket repo that
 *   destructures from Node's internal `primordials` global needs to keep its
 *   usage shape-aligned with socket-lib's userland mirror
 *   (`@socketsecurity/lib/primordials`). This module is the parser + diff
 *   engine. The caller supplies a config with the per-repo policy: which dirs
 *   to scan, naming aliases, and the allowlist. Used by the `socket-lib check
 *   primordials` CLI subcommand. Kept importable as a library so repos with
 *   bespoke needs can compose it directly without going through the CLI. The
 *   flow:
 *
 *   1. Walk the configured `scanDirs` for `*.js` files.
 *   2. From each file, extract names from every `const { Foo, Bar } = primordials`
 *      destructure.
 *   3. Read socket-lib's `primordials/` directory from a sibling clone, or
 *      `primordials/*.d.ts` from installed `node_modules`, and pull every
 *      exported name across all leaves.
 *   4. Diff: every destructured name must be either (a) in socket-lib verbatim,
 *      (b) in socket-lib via the configured alias map, or (c) in the configured
 *      node-internal-only allowlist. Findings come back classified so callers
 *      can render or fail-CI on specific kinds.
 */

import { joinOr } from '../../arrays/join.mjs'
import { arrayToSorted } from '../../polyfills/array.mjs'
import { ErrorCtor } from '../error.mjs'
import { StringPrototypeSlice } from '../string.mjs'
import { getNodeFs } from '../../node/fs.mjs'
import { getNodePath } from '../../node/path.mjs'

// ── Config ──────────────────────────────────────────────────────────

export interface PrimordialsCheckConfig {
  /**
   * Repo-relative directories to scan recursively for `*.js` files containing
   * `primordials` destructures. Each entry is resolved against `repoRoot`.
   */
  readonly scanDirs: readonly string[]
  /**
   * Map from the source name a repo destructures (e.g. `Array`) to the
   * socket-lib export name it should resolve to (e.g. `ArrayCtor`). socket-lib
   * uses the `Ctor` suffix to avoid shadowing globals; repos that need the
   * original name go through the alias.
   */
  readonly aliasMap: ReadonlyMap<string, string>
  /**
   * Names that exist only in Node's internal `primordials` and are
   * intentionally NOT mirrored to socket-lib. Adding to this set is a
   * deliberate decision per name.
   */
  readonly nodeInternalOnly: ReadonlySet<string>
  /**
   * Override the auto-resolution of socket-lib's primordials source. Useful for
   * tests; production callers should leave this undefined so the resolver picks
   * sibling clone → installed `node_modules`.
   */
  readonly socketLibPrimordialsPath?: string | undefined
  /**
   * Repo root used to resolve `scanDirs` and to anchor the sibling-clone
   * fallback (`<repoRoot>/../socket-lib/...`). Defaults to `process.cwd()`.
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
 * Run the primordials drift check against the configured repo. Returns the full
 * result including the raw inputs, both used names and lib exports, so
 * renderers can show context, plus a sorted list of findings classified by
 * kind.
 */
export function checkPrimordials(
  config: PrimordialsCheckConfig,
): PrimordialsCheckResult {
  const repoRoot = config.repoRoot ?? process.cwd()

  // Collect the repo's primordial names + which files use them.
  const used = new Set<string>()
  const usedToFiles = new Map<string, string[]>()

  for (const dir of config.scanDirs) {
    const path = getNodePath()
    const fullDir = path.resolve(repoRoot, dir)
    const jsFiles = collectJsFiles(fullDir)
    for (const file of jsFiles) {
      let src: string
      try {
        const fs = getNodeFs()
        src = fs.readFileSync(file, 'utf8')
        // getNodeFs().readFileSync rarely throws on files we just enumerated; the
        // includes()-false and names-empty arms fire only on files
        // that don't actually destructure primordials.
        /* c8 ignore start - getNodeFs().readFileSync rarely throws on files already enumerated */
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

  // Read socket-lib's exported names. The resolver returns either a file for
  // the legacy single-file layout or a directory for the post-split layout.
  const socketLibPath = resolveSocketLibPrimordials(config)
  const socketLibNames = readSocketLibPrimordialNames(socketLibPath)

  // Diff.
  const findings: PrimordialsFinding[] = []
  const usedNames = arrayToSorted([...used])
  for (let i = 0, { length } = usedNames; i < length; i += 1) {
    const name = usedNames[i]!
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
    /* c8 ignore start - usedToFiles fallback is unreachable by construction */
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
          'to the appropriate leaf under socket-lib/src/primordials/.',
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
          `add \`${name}\` to the appropriate leaf under socket-lib/src/primordials/`,
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

/**
 * Recursively collect every `*.js` file under `dir`.
 */
export function collectJsFiles(dir: string): string[] {
  const out: string[] = []
  const fs = getNodeFs()
  if (!fs.existsSync(dir)) {
    return out
  }
  const stack = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()!
    let entries: string[]
    try {
      entries = fs.readdirSync(cur)
    } catch {
      continue
    }
    for (let i = 0, { length } = entries; i < length; i += 1) {
      const name = entries[i]!
      const path = getNodePath()
      const full = path.join(cur, name)
      let stat
      try {
        // oxlint-disable-next-line socket/prefer-exists-sync -- needs isDirectory
        stat = fs.statSync(full)
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
 * Pull every `const { … } = primordials` destructure body out of `src`.
 * Comments are stripped first so commentary inside a destructure doesn't leak
 * into captured names. The body regex disallows nested `}`, which is safe after
 * the comment-strip pass — destructures themselves don't contain `}`.
 */
export function extractPrimordialsNames(src: string): string[] {
  const cleaned = stripComments(src)
  const re = /const\s*\{\s*([^}]*?)\}\s*=\s*primordials\b/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    const rawNames = m[1]!.split(',')
    for (let i = 0, { length } = rawNames; i < length; i += 1) {
      const raw = rawNames[i]!
      const trimmed = raw.trim()
      if (!trimmed) {
        continue
      }
      // `Foo: BarAlias` keeps `Foo` (the source name on the LHS).
      const nameMatch = NAME_HEAD_RE.exec(trimmed)
      // nameMatch null arm fires on malformed export-list segments,
      // which tests don't simulate.
      /* c8 ignore start - malformed export-list segments aren't tested */
      if (nameMatch) {
        out.push(nameMatch[1]!)
      }
      /* c8 ignore stop */
    }
  }
  return out
}

/**
 * Pull every `export const Foo` / `export function Foo` / `export { Foo }` from
 * a TS file. Also matches `.d.ts` declaration forms (`export declare const
 * Foo`, `export declare function Foo`) since the fallback path reads
 * `primordials.d.ts` from `node_modules` when no sibling clone is present.
 */
export function extractTsExports(src: string): string[] {
  const out = new Set<string>()
  // `export [declare] const <name>` at line start (multiline): group 1 is the
  // identifier (JS ident chars, can't start with a digit). `declare` optional.
  for (const m of src.matchAll(
    /^export\s+(?:declare\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
  )) {
    out.add(m[1]!)
  }
  // Same as above for `export [declare] function <name>`: group 1 is the name.
  for (const m of src.matchAll(
    /^export\s+(?:declare\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
  )) {
    out.add(m[1]!)
  }
  // Whitespace runs are bounded. `\s*` before the required `{` lets a long run
  // rescan from each position (CodeQL js/polynomial-redos); real source puts a
  // single space there, so 16 is generous.
  for (const m of src.matchAll(/^export\s{0,16}\{\s{0,16}([^}]+)\}/gm)) {
    const rawNames = m[1]!.split(',')
    for (let i = 0, { length } = rawNames; i < length; i += 1) {
      const raw = rawNames[i]!
      const trimmed = raw.trim()
      if (!trimmed) {
        continue
      }
      const nameMatch = NAME_HEAD_RE.exec(trimmed)
      // nameMatch null arm fires on malformed export-list segments,
      // which tests don't simulate.
      /* c8 ignore start - malformed export-list segments aren't tested */
      if (nameMatch) {
        out.add(nameMatch[1]!)
      }
      /* c8 ignore stop */
    }
  }
  return [...out]
}

/**
 * Read TS exports from a resolved primordials path. Handles both the legacy
 * single-file layout, returning that one file's exports, and the post-split
 * directory layout, concatenating exports across every `*.ts` / `*.d.ts` leaf.
 */
export function readSocketLibPrimordialNames(resolved: string): Set<string> {
  const fs = getNodeFs()
  // oxlint-disable-next-line socket/prefer-exists-sync -- needs isFile
  const stat = fs.statSync(resolved)
  if (stat.isFile()) {
    return new Set(extractTsExports(fs.readFileSync(resolved, 'utf8')))
  }
  // Directory: concatenate all *.ts and *.d.ts leaves.
  const out = new Set<string>()
  // Each scanned leaf either has TS exports or is a leftover declaration
  // file; we don't separate them — the parser handles both forms.
  /* c8 ignore start - leaf-classification branches aren't tested separately */
  for (const name of fs.readdirSync(resolved)) {
    if (!name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      continue
    }
    const path = getNodePath()
    const full = path.join(resolved, name)
    // oxlint-disable-next-line socket/prefer-exists-sync -- needs isFile
    const fileStat = fs.statSync(full)
    if (!fileStat.isFile()) {
      continue
    }
    for (const exp of extractTsExports(fs.readFileSync(full, 'utf8'))) {
      out.add(exp)
    }
  }
  /* c8 ignore stop */
  return out
}

/**
 * Locate socket-lib's primordials source. Search order:
 *
 * 1. `config.socketLibPrimordialsPath` if explicitly set. Accepts either a single
 *    file (legacy `primordials.ts` / `.d.ts`) or a directory of leaves
 *    (`primordials/`).
 * 2. Sibling clone — `<repoRoot>/../socket-lib/src/primordials/` (post-split
 *    layout) or `<repoRoot>/../socket-lib/src/primordials.ts` (legacy
 *    single-file layout). Preferred for the dev-loop case where a developer is
 *    editing socket-lib and a consumer in parallel.
 * 3. Installed copy — `<repoRoot>/node_modules/@socketsecurity/lib/
 *    dist/primordials/` (post-split) or `<repoRoot>/node_modules/
 *    @socketsecurity/lib/dist/primordials.d.ts` (legacy). The CI fallback.
 *
 * Throws when none of the candidates exist.
 */
export function resolveSocketLibPrimordials(
  config: PrimordialsCheckConfig,
): string {
  // Each resolver branch (explicit path, sibling clone, installed
  // fallback) needs a specific test setup; the branch tracker reports
  // them sub-arms separately even when the primary path is hit.
  /* c8 ignore start - resolver branch needs dedicated test setup per candidate */
  if (config.socketLibPrimordialsPath) {
    const fs = getNodeFs()
    if (!fs.existsSync(config.socketLibPrimordialsPath)) {
      throw new ErrorCtor(
        `socketLibPrimordialsPath does not exist: ${config.socketLibPrimordialsPath}`,
      )
    }
    return config.socketLibPrimordialsPath
  }
  const repoRoot = config.repoRoot ?? process.cwd()
  const path = getNodePath()
  const siblingDir = path.resolve(
    repoRoot,
    '..',
    'socket-lib',
    'src',
    'primordials',
  )
  const fs = getNodeFs()
  if (fs.existsSync(siblingDir)) {
    return siblingDir
  }
  const siblingLegacy = path.resolve(
    repoRoot,
    '..',
    'socket-lib',
    'src',
    'primordials.ts',
  )
  if (fs.existsSync(siblingLegacy)) {
    return siblingLegacy
  }
  const installedDir = path.resolve(
    repoRoot,
    'node_modules',
    '@socketsecurity',
    'lib',
    'dist',
    'primordials',
  )
  if (fs.existsSync(installedDir)) {
    return installedDir
  }
  const installedLegacy = path.resolve(
    repoRoot,
    'node_modules',
    '@socketsecurity',
    'lib',
    'dist',
    'primordials.d.ts',
  )
  if (fs.existsSync(installedLegacy)) {
    return installedLegacy
  }
  /* c8 ignore stop */
  throw new ErrorCtor(
    'Cannot locate socket-lib primordials source. ' +
      `Looked at:\n  ${siblingDir}\n  ${siblingLegacy}\n  ${installedDir}\n  ${installedLegacy}\n` +
      'Either clone socket-lib at ../socket-lib or run `pnpm install`.',
  )
}

// Remove every `/* … */` block, walking the string once.
//
// The regex form is `/\/\*[\s\S]*?\*\//g`: a lazy body scan up to a required
// closing delimiter. On input that opens a block and never closes it, the
// engine retries that scan from every later position, which is quadratic
// (CodeQL js/polynomial-redos). Two indexOf calls per block read the same shape
// in one pass, and an unterminated block drops its tail exactly as the lazy
// match did - by matching nothing.
export function stripBlockComments(src: string): string {
  let out = ''
  let cursor = 0
  for (;;) {
    const open = src.indexOf('/*', cursor)
    if (open === -1) {
      break
    }
    const close = src.indexOf('*/', open + 2)
    if (close === -1) {
      break
    }
    out += StringPrototypeSlice(src, cursor, open)
    cursor = close + 2
  }
  return cursor === 0 ? src : out + StringPrototypeSlice(src, cursor)
}

/**
 * Strip `/* … *‍/` block comments and `//` line comments. Comments inside
 * primordials destructures would otherwise leak captured names; stripping first
 * keeps the regex simple.
 */
export function stripComments(src: string): string {
  let out = stripBlockComments(src)
  // Indent runs are bounded for the same reason: an unbounded `[\t ]*` sitting
  // before the required `//` rescans a long indent from every position.
  out = out.replace(/^[\t ]{0,200}\/\/.*$/gm, '')
  out = out.replace(/[\t ]{1,200}\/\/.*$/gm, '')
  return out
}
