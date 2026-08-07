/**
 * @file `prim` CLI entry point. Subcommands: audit — find call sites where
 *   primordials apply. Shows both migration candidates (covered) and surface
 *   gaps (gap) by default. Filter with `--coverage` or `--gaps` to narrow
 *   output. mod — rewrite call sites to use primordials. Dry-run by default;
 *   `--apply` to write. .js/.mjs/.cjs/.jsx only. lint — structural lint rules
 *   for primordials usage. Currently: ctor-rename (constructor primordials must
 *   be aliased `<Name>: <Name>Ctor` when destructured from `primordials` or any
 *   configured primordials-shaped source). Exits 1 if violations are found.
 *   Common flags: --target <path> The repo to audit. Defaults to cwd. --dir
 *   <name> Subdirectory to scan inside the target. Defaults to `dist`. Use
 *   `src` to scan source instead. --json Emit JSON instead of human-readable
 *   text. --help, -h Print help and exit. `audit`-only flags (filter the
 *   unified findings list): --coverage Show only call sites covered by an
 *   existing primordial, the migration candidates. --gaps Show only call sites
 *   whose primordial doesn't exist yet, the surface-expansion candidates. Both
 *   omitted = both shown. `audit`/`mod`-only flag: --surface <path> Explicit
 *   primordials source file. Overrides the default sibling/installed lookup.
 *   `mod`-only flags: --apply Actually write file changes; the default is
 *   dry-run. --include-guessed Also rewrite prototype-method calls where the
 *   receiver type was guessed from the identifier name (e.g. `arr.map(fn)` →
 *   ArrayPrototypeMap). Off by default — requires manual review. `lint`-only
 *   flag: --primordials-source <name> (repeatable) Identifier or require()
 *   specifier to treat as a primordials-shaped source. Defaults: `primordials`,
 *   `internal/socketsecurity/primordials`,
 *   `internal/socketsecurity/safe-references`, `safe-references`.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { describeRequest, renderDescribe } from '../../../src/exe/argv/meta.ts'

import { auditDirectory } from './audit.mts'
import { applyCodemod } from './codemod.mts'
import { HELP, MANIFEST, renderDescribeHelpJson } from './describe.mts'
import { lintSource } from './lint.mts'
import { fail, report, reportLint, reportMod } from './report.mts'
import { loadPrimordialsSurface } from './surface.mts'

// Argument schema. parseArgs in node:util gives us strict validation and
// `--key=value` parsing for free.
const ARG_OPTIONS = {
  'ai-disambiguate': { type: 'boolean', default: false },
  apply: { type: 'boolean', default: false },
  coverage: { type: 'boolean', default: false },
  // `--diff` renders a unified diff per planned rewrite during dry-run.
  // Defaults to false to keep the existing summary output stable; opt-in
  // when you want to review the actual rewrites before `--apply`.
  diff: { type: 'boolean', default: false },
  dir: { type: 'string' },
  gaps: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  'include-guessed': { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
  // `--no-validate` opts OUT of the cross-batch validation phase. Default
  // ON — the safer setting. Use this only when you know the rewrite is
  // safe AND the validator is being too conservative.
  'no-validate': { type: 'boolean', default: false },
  'primordials-source': { type: 'string', multiple: true },
  surface: { type: 'string' },
  target: { type: 'string' },
}

export async function runCli(argv) {
  const describeKind = describeRequest(argv)
  if (describeKind) {
    // `--describe --json` (either order) answers the fleet-runner-shaped
    // `{describe, help}` envelope instead of the full command manifest —
    // plain `--describe` stays the one-liner, unchanged.
    process.stdout.write(
      describeKind === 'json'
        ? renderDescribeHelpJson()
        : renderDescribe(describeKind, MANIFEST),
    )
    return
  }
  // Bare `prim` / `prim help` / `prim --help` → print help. With --json
  // riding along and no command to report a result for, answer the same
  // `{describe, help}` envelope rather than silently ignoring the flag.
  if (argv.length === 0 || argv[0] === 'help') {
    process.stdout.write(
      argv.includes('--json') ? renderDescribeHelpJson() : HELP,
    )
    return
  }

  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: ARG_OPTIONS,
      allowPositionals: true,
      strict: true,
    })
  } catch (e) {
    fail(`${e.message}\n\n${HELP}`)
  }

  const { values, positionals } = parsed

  if (values.help || positionals.length === 0) {
    // No command to report a JSON result for — `--json` alone answers the
    // same `{describe, help}` envelope as `--describe --json` rather than
    // falling through to the human help banner.
    process.stdout.write(values.json ? renderDescribeHelpJson() : HELP)
    return
  }

  const command = positionals[0]

  const targetArg = values.target ?? '.'
  // `audit` inspects bundled output by default → `dist`. `mod` and
  // `lint` inspect source → `src`.
  const dirDefault = command === 'audit' ? 'dist' : 'src'
  const dirArg = values.dir ?? dirDefault
  const json = values.json

  const targetRoot = path.resolve(targetArg)
  if (!existsSync(targetRoot)) {
    fail(`target not found: ${targetRoot}`)
  }
  const scanDir = path.join(targetRoot, dirArg)
  if (!existsSync(scanDir)) {
    fail(
      `${path.basename(targetRoot)}: \`${dirArg}/\` not found. ` +
        `Run \`pnpm run build\` in the target first, or pass \`--dir src\`.`,
    )
  }

  // `lint` is purely structural — it doesn't need a primordials surface.
  // Handle it before the surface load so users don't need to pass
  // --surface for a lint-only check.
  if (command === 'lint') {
    const primordialSources = values['primordials-source']
    const findings = lintSource({
      targetRoot,
      scanDir,
      primordialSources: Array.isArray(primordialSources)
        ? primordialSources
        : primordialSources
          ? [primordialSources]
          : undefined,
    })
    reportLint(findings, json, path.basename(targetRoot))
    if (findings.length > 0) {
      process.exitCode = 1
    }
    return
  }

  let surface
  try {
    surface = loadPrimordialsSurface(targetRoot, values.surface)
  } catch (e) {
    fail(e.message)
  }

  // Codemod runs its own pass — don't pre-audit (avoids any
  // shared-AST surprises and is faster).
  if (command === 'mod') {
    // Auto-detect when we're scanning a tree that owns its OWN
    // `primordials.ts` (i.e. socket-lib itself, or any project that
    // re-exports primordials from a local module). When the tree owns
    // it, inserted imports must be RELATIVE — `'../primordials'` from
    // a sub-dir, `'./primordials'` from the same dir — not the
    // package-name specifier `'@socketsecurity/lib/primordials'`,
    // which would create a circular-self-import.
    const localPrimordialsPath = findLocalPrimordials(scanDir)
    let importStyle:
      | undefined
      | {
          kind: 'esm'
          specifier?: ((absFile: string) => string) | undefined
          splitByLeaf?:
            | {
                exportToLeaf: Map<string, string>
                leafSpecifier: (absFile: string, leaf: string) => string
              }
            | undefined
        }
    if (localPrimordialsPath) {
      if (isSplitPrimordials(localPrimordialsPath)) {
        // Split-surface layout: `primordials/` directory with per-leaf
        // files. The codemod groups identifiers by leaf and emits one
        // import per leaf — `from '../primordials/array'`, etc.
        importStyle = {
          kind: 'esm' as const,
          specifier: (): string => '',
          splitByLeaf: {
            exportToLeaf: surface.exportToLeaf,
            leafSpecifier: (absFile: string, leaf: string): string => {
              const fileDir = path.dirname(absFile)
              let rel = path.relative(
                fileDir,
                path.join(localPrimordialsPath, leaf),
              )
              rel = rel.replace(/\.(?:cjs|cts|js|mjs|mts|ts|tsx)$/, '')
              if (!rel.startsWith('.')) {
                rel = './' + rel
              }
              return rel
            },
          },
        }
      } else {
        // Legacy single-file primordials. Insert one combined import
        // from the relative path.
        importStyle = {
          kind: 'esm' as const,
          specifier: (absFile: string): string => {
            const fileDir = path.dirname(absFile)
            let rel = path.relative(fileDir, localPrimordialsPath)
            // Strip the .ts/.mts/.cts/.js extension — bare-specifier
            // import (TypeScript convention; `tsc` resolves the ext).
            rel = rel.replace(/\.(?:cjs|cts|js|mjs|mts|ts|tsx)$/, '')
            // Path.relative drops the leading `./` for same-dir, but
            // ESM specifiers require `./` or `../` to distinguish
            // relative paths from package names. Re-add when missing.
            if (!rel.startsWith('.')) {
              rel = './' + rel
            }
            return rel
          },
        }
      }
    }
    const result = await applyCodemod({
      aiDisambiguate: values['ai-disambiguate'],
      apply: values.apply,
      exported: surface.exports,
      ...(importStyle ? { importStyle } : {}),
      includeGuessed: values['include-guessed'],
      ...(localPrimordialsPath ? { localPrimordialsPath } : {}),
      nullable: surface.nullable,
      scanDir,
      targetRoot,
      validate: !values['no-validate'],
    })
    reportMod(result, json, values.apply, values.diff)
    return
  }

  if (command === 'audit') {
    const findings = await auditDirectory({
      aiDisambiguate: values['ai-disambiguate'],
      exported: surface.exports,
      scanDir,
      targetRoot,
    })
    // Filter mode based on flags. The two flags are partitioning
    // filters on the same dataset:
    //   neither       → all (covered + gap + redeclaration)
    //   --coverage    → only covered + redeclaration (both are
    //                   migration candidates against the existing
    //                   primordials surface — gap = need to add to
    //                   primordials, redeclaration = need to use
    //                   the existing primordial)
    //   --gaps        → only gap (what's missing from primordials.ts)
    //   --coverage --gaps → all; explicit and redundant, but allowed
    const wantCoverage = values.coverage || !values.gaps
    const wantGaps = values.gaps || !values.coverage
    let filtered = findings
    if (!wantCoverage) {
      filtered = filtered.filter(
        f => f.kind !== 'covered' && f.kind !== 'redeclaration',
      )
    }
    if (!wantGaps) {
      filtered = filtered.filter(f => f.kind !== 'gap')
    }
    const mode =
      values.coverage && !values.gaps
        ? 'coverage'
        : values.gaps && !values.coverage
          ? 'gaps'
          : 'audit'
    // Audits silently skip files that fail to parse or fail TS-strip.
    // Pull the per-file lists off the findings array (they're attached
    // there by audit.mts) and pass them through so neither human nor
    // JSON consumers lose visibility into incomplete coverage.
    const parseFailureFiles: string[] = findings.parseFailureFiles ?? []
    const stripFailureFiles: string[] = findings.stripFailureFiles ?? []
    report(
      filtered,
      json,
      path.basename(targetRoot),
      mode,
      parseFailureFiles,
      stripFailureFiles,
    )
    if (!json) {
      // Human-readable warning + per-file list. Goes to stderr so the
      // findings on stdout stay machine-pipeable.
      const totalSkipped = parseFailureFiles.length + stripFailureFiles.length
      if (totalSkipped > 0) {
        // CLI tool: stderr for human warnings keeps stdout pure
        // machine-pipeable JSON / findings text.
        const warnMsg = `prim: warning — ${totalSkipped} file(s) skipped and excluded from findings. Audit is incomplete.\n`
        process.stderr.write(warnMsg)
        if (parseFailureFiles.length > 0) {
          const header = `  parse-failed (${parseFailureFiles.length}):\n`
          process.stderr.write(header)
          for (let i = 0, { length } = parseFailureFiles; i < length; i += 1) {
            const f = parseFailureFiles[i]!
            process.stderr.write(`    ${f}\n`)
          }
        }
        if (stripFailureFiles.length > 0) {
          const header = `  ts-strip-failed (${stripFailureFiles.length}):\n`
          process.stderr.write(header)
          for (let i = 0, { length } = stripFailureFiles; i < length; i += 1) {
            const f = stripFailureFiles[i]!
            process.stderr.write(`    ${f}\n`)
          }
        }
      }
    }
    return
  }

  fail(`unknown command: ${command}\n\n${HELP}`)
}

// Extensions checked when looking for a sibling `primordials.*` file
// to switch the codemod into relative-import mode. Sorted alphanumeric.
const PRIMORDIALS_FILE_EXTS = ['.cjs', '.cts', '.js', '.mjs', '.mts', '.ts']

/**
 * Walk up from `scanDir` looking for a sibling
 * `primordials.{ts,mts,cts,js,mjs,cjs}` file, OR a `primordials/` directory
 * containing per-leaf files (`primordials/array.ts`, `primordials/string.ts`,
 * etc. — the split-surface layout socket-lib uses today). Returns the absolute
 * path to the file or directory, or `undefined` if neither is found within the
 * scan root.
 *
 * The codemod uses this to decide whether to insert relative-path imports (when
 * the project owns primordials) vs. the package-name specifier (when consuming
 * `@socketsecurity/lib`).
 *
 * Search order: scanDir itself, then a single level up. Beyond that we assume
 * any primordials.* found is unrelated (avoid drifting up to a monorepo-root
 * primordials owned by a sibling package).
 */
// Helper sits after `runCli` so the module reads entry-point-first; the
// `PRIMORDIALS_FILE_EXTS` config between them blocks safe autofix
// reordering.
// oxlint-disable-next-line socket/sort-source-methods -- reads entry-first
export function findLocalPrimordials(scanDir): string | undefined {
  const candidates = [scanDir, path.dirname(scanDir)]
  for (let i = 0, { length: dl } = candidates; i < dl; i++) {
    const dir = candidates[i]!
    // 1. Legacy single-file shape: primordials.{ext}
    for (let j = 0, { length: el } = PRIMORDIALS_FILE_EXTS; j < el; j++) {
      const candidate = path.join(dir, `primordials${PRIMORDIALS_FILE_EXTS[j]}`)
      if (existsSync(candidate)) {
        return candidate
      }
    }
    // 2. Split-surface shape: primordials/ directory containing per-leaf
    //    files (`array.ts`, `process.ts`, etc.). Returning the directory path
    //    lets the caller compute `../primordials/array` style imports via
    //    splitByLeaf.
    const dirCandidate = path.join(dir, 'primordials')
    if (existsSync(dirCandidate) && statSync(dirCandidate).isDirectory()) {
      const entries = readdirSync(dirCandidate, { withFileTypes: true })
      for (let j = 0, { length: el } = entries; j < el; j++) {
        const entry = entries[j]!
        if (
          entry.isFile() &&
          PRIMORDIALS_FILE_EXTS.includes(path.extname(entry.name))
        ) {
          return dirCandidate
        }
      }
    }
  }
  return undefined
}

/**
 * Returns true when `localPrimordialsPath` points at a directory of per-leaf
 * primordials files, which is the split-surface layout that socket-lib uses;
 * false when it's the legacy single-file shape.
 *
 * Callers use this to choose between top-level `specifier` (single-file) and
 * `splitByLeaf` (directory) import wiring.
 */
// Helper sits after `runCli` so the module reads entry-point-first; the
// `PRIMORDIALS_FILE_EXTS` config between them blocks safe autofix
// reordering.
// oxlint-disable-next-line socket/sort-source-methods -- reads entry-first
export function isSplitPrimordials(localPrimordialsPath: string): boolean {
  try {
    return statSync(localPrimordialsPath).isDirectory()
  } catch {
    return false
  }
}
