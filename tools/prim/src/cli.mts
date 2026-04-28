/**
 * @fileoverview `prim` CLI entry point.
 *
 * Subcommands:
 *   audit       — find call sites where primordials apply. Shows both
 *                 migration candidates (covered) and surface gaps (gap)
 *                 by default. Filter with `--coverage` or `--gaps` to
 *                 narrow output.
 *   mod         — rewrite call sites to use primordials. Dry-run by
 *                 default; `--apply` to write. .js/.mjs/.cjs/.jsx only.
 *   lint        — structural lint rules for primordials usage. Currently:
 *                 ctor-rename (constructor primordials must be aliased
 *                 `<Name>: <Name>Ctor` when destructured from
 *                 `primordials` or any configured primordials-shaped
 *                 source). Exits 1 if violations are found.
 *
 * Common flags:
 *   --target <path>     The repo to audit. Defaults to cwd.
 *   --dir <name>        Subdirectory to scan inside the target. Defaults
 *                       to `dist`. Use `src` to scan source instead.
 *   --json              Emit JSON instead of human-readable text.
 *   --help, -h          Print help and exit.
 *
 * `audit`-only flags (filter the unified findings list):
 *   --coverage          Show only call sites covered by an existing
 *                       primordial (migration candidates).
 *   --gaps              Show only call sites whose primordial doesn't
 *                       exist yet (surface-expansion candidates).
 *                       Both omitted = both shown.
 *
 * `audit`/`mod`-only flag:
 *   --surface <path>    Explicit primordials source file. Overrides
 *                       the default sibling/installed lookup.
 *
 * `mod`-only flags:
 *   --apply             Actually write file changes (default is dry-run).
 *   --include-guessed   Also rewrite prototype-method calls where the
 *                       receiver type was guessed from the identifier
 *                       name (e.g. `arr.map(fn)` → ArrayPrototypeMap).
 *                       Off by default — requires manual review.
 *
 * `lint`-only flag:
 *   --primordials-source <name>   (repeatable) Identifier or require()
 *                       specifier to treat as a primordials-shaped source.
 *                       Defaults: `primordials`,
 *                       `internal/socketsecurity/primordials`,
 *                       `internal/socketsecurity/safe-references`,
 *                       `safe-references`.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { auditDirectory } from './audit.mts'
import { applyCodemod } from './codemod.mts'
import { formatHuman, formatJson } from './format.mts'
import { formatLintFindings, lintSource } from './lint.mts'
import { loadPrimordialsSurface } from './surface.mts'

const HELP = `prim — audit & migrate JavaScript built-in usage to primordials

USAGE
  prim <command> [options]

COMMANDS
  audit                Find call sites where primordials apply.
                       Default: shows migration candidates AND surface
                       gaps. Filter with --coverage or --gaps.
  mod                  Rewrite call sites to use primordials. Dry-run
                       by default; pass --apply to write. .js only.
  lint                 Structural lint rules for primordials usage.
                       Currently: ctor-rename (constructor primordials
                       must be aliased \`<Name>: <Name>Ctor\`).
                       Exits 1 if violations are found.

COMMON OPTIONS
  --target <path>      Repo to audit (default: cwd).
  --dir <name>         Subdirectory to scan. Default \`dist\` for audit;
                       default \`src\` for mod and lint.
  --json               JSON output instead of human-readable text.
  --help, -h           Show this help.

\`audit\` OPTIONS
  --coverage           Show only migration candidates.
  --gaps               Show only surface gaps.
                       (No flag = both.)
  --surface <path>     Explicit primordials source file (overrides the
                       default sibling/installed lookup). Use this to
                       audit against Node's
                       lib/internal/per_context/primordials.js or any
                       other primordials-shaped source.

\`mod\` OPTIONS
  --apply              Actually write file changes. Without this, runs
                       as a dry-run and prints the diff summary only.
  --include-guessed    Also rewrite prototype-method calls where the
                       receiver type was guessed from the identifier
                       name. Off by default — these need manual review.
  --surface <path>     Explicit primordials source file (same as audit).

\`lint\` OPTIONS
  --primordials-source <name>  (repeatable) Identifier or require()
                       specifier to treat as a primordials-shaped source.
                       Defaults: \`primordials\`,
                       \`internal/socketsecurity/primordials\`,
                       \`internal/socketsecurity/safe-references\`,
                       \`safe-references\`.

EXAMPLES
  # See migration candidates + surface gaps in src/:
  prim audit --target . --dir src

  # Only the gaps (what's missing from socket-lib's primordials):
  prim audit --target ../socket-cli --gaps

  # Only the migration candidates (what we could rewrite today):
  prim audit --target . --dir dist --coverage

  # Dry-run a codemod over the source tree:
  prim mod --target . --dir src

  # Apply for real (only after reviewing the dry-run):
  prim mod --target . --dir src --apply

  # Lint additions for ctor-rename violations:
  prim lint --target additions/source-patched --dir lib
`

// Argument schema. parseArgs in node:util gives us strict validation and
// `--key=value` parsing for free.
const ARG_OPTIONS = {
  target: { type: 'string' },
  dir: { type: 'string' },
  json: { type: 'boolean', default: false },
  surface: { type: 'string' },
  'primordials-source': { type: 'string', multiple: true },
  coverage: { type: 'boolean', default: false },
  gaps: { type: 'boolean', default: false },
  apply: { type: 'boolean', default: false },
  'include-guessed': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
}

export async function runCli(argv) {
  // Bare `prim` / `prim help` / `prim --help` → print help.
  if (argv.length === 0 || argv[0] === 'help') {
    process.stdout.write(HELP)
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
    process.stdout.write(HELP)
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
    const result = await applyCodemod({
      targetRoot,
      scanDir,
      exported: surface.exports,
      apply: values.apply,
      includeGuessed: values['include-guessed'],
    })
    reportMod(result, json, values.apply)
    return
  }

  if (command === 'audit') {
    const findings = auditDirectory({
      targetRoot,
      scanDir,
      exported: surface.exports,
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
    //   --coverage --gaps → all (explicit, redundant but allowed)
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
        process.stderr.write(
          `prim: warning — ${totalSkipped} file(s) skipped and excluded from findings. ` +
            `Audit is incomplete.\n`,
        )
        if (parseFailureFiles.length > 0) {
          process.stderr.write(
            `  parse-failed (${parseFailureFiles.length}):\n`,
          )
          for (const f of parseFailureFiles) {
            process.stderr.write(`    ${f}\n`)
          }
        }
        if (stripFailureFiles.length > 0) {
          process.stderr.write(
            `  ts-strip-failed (${stripFailureFiles.length}):\n`,
          )
          for (const f of stripFailureFiles) {
            process.stderr.write(`    ${f}\n`)
          }
        }
      }
    }
    return
  }

  fail(`unknown command: ${command}\n\n${HELP}`)
}

function report(
  findings,
  json,
  targetName,
  mode,
  parseFailureFiles: string[] = [],
  stripFailureFiles: string[] = [],
) {
  if (json) {
    // Embed the failure lists in the JSON output so machine consumers
    // can see what got skipped — non-enumerable handles on the array
    // don't survive JSON.stringify, so we lift them onto the wrapper.
    process.stdout.write(
      formatJson({
        targetName,
        mode,
        count: findings.length,
        findings,
        parseFailures: parseFailureFiles.length,
        parseFailureFiles,
        stripFailures: stripFailureFiles.length,
        stripFailureFiles,
      }) + '\n',
    )
  } else {
    process.stdout.write(formatHuman(findings, { mode, targetName }) + '\n')
  }
}

function reportLint(findings, json, targetName) {
  if (json) {
    process.stdout.write(
      formatJson({
        targetName,
        mode: 'lint',
        count: findings.length,
        findings,
      }) + '\n',
    )
    return
  }
  process.stdout.write(formatLintFindings(findings, { targetName }))
}

function reportMod(result, json, applied) {
  if (json) {
    process.stdout.write(
      formatJson({
        applied,
        filesChanged: result.filesChanged,
        rewriteCount: result.rewriteCount,
        skipped: result.skipped,
        files: result.files,
      }) + '\n',
    )
    return
  }
  const verb = applied ? 'Wrote' : 'Would write'
  if (result.rewriteCount === 0) {
    process.stdout.write('mod: no rewrites needed.\n')
    return
  }
  process.stdout.write(
    `mod: ${verb} ${result.rewriteCount} rewrite(s) across ${result.filesChanged} file(s).\n`,
  )
  if (result.skipped > 0) {
    process.stdout.write(
      `mod: skipped ${result.skipped} candidate(s) — pass --include-guessed to rewrite receiver-guessed sites too.\n`,
    )
  }
  if (!applied) {
    process.stdout.write('mod: dry run — pass --apply to write changes.\n')
  }
  for (const f of result.files) {
    process.stdout.write(
      `  ${f.file}: ${f.rewrites} rewrite(s), import added: ${f.importAdded ? 'yes' : 'no'}\n`,
    )
  }
}

function fail(msg) {
  process.stderr.write(`prim: ${msg}\n`)
  process.exit(1)
}
