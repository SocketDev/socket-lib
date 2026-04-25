/**
 * @fileoverview `prim` CLI entry point.
 *
 * Subcommands:
 *   audit     — full report: coverage + gaps in one pass.
 *   coverage  — only call sites where a primordial already exists
 *               (migration candidates).
 *   gaps      — only call sites where no primordial exists yet
 *               (surface-expansion candidates).
 *   mod       — rewrite call sites to use primordials. Dry-run by default;
 *               pass `--apply` to write changes. Adds the import block.
 *   state     — show or diff the persisted state file.
 *
 * Common flags:
 *   --target <path>     The repo to audit. Defaults to cwd.
 *   --dir <name>        Subdirectory to scan inside the target. Defaults
 *                       to `dist`. Use `src` to scan source instead.
 *   --json              Emit JSON instead of human-readable text.
 *   --state <path>      State file path. Defaults to `<cwd>/.prim-state.json`.
 *   --update-state      Persist this run's findings into the state file.
 *   --help, -h          Print help and exit.
 *
 * `mod`-only flags:
 *   --apply             Actually write file changes (default is dry-run).
 *   --include-guessed   Also rewrite prototype-method calls where the
 *                       receiver type was guessed from the identifier
 *                       name (e.g. `arr.map(fn)` → ArrayPrototypeMap).
 *                       Off by default — requires manual review.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { auditDirectory } from './audit.mts'
import { applyCodemod } from './codemod.mts'
import { formatHuman, formatJson } from './format.mts'
import { defaultStatePath, loadState, rollup, saveState } from './state.mts'
import { loadPrimordialsSurface } from './surface.mts'

const HELP = `prim — audit & migrate JavaScript built-in usage to @socketsecurity/lib/primordials

USAGE
  prim <command> [options]

COMMANDS
  audit                Report both coverage (existing primordials you can use)
                       and gaps (primordials missing from the surface).
  coverage             Only show migration candidates — existing primordials.
  gaps                 Only show surface gaps — uncovered patterns.
  mod                  Rewrite call sites to use primordials. Dry-run by default.
  state                Show the persisted state file.

COMMON OPTIONS
  --target <path>      Repo to audit (default: cwd).
  --dir <name>         Subdirectory to scan. Default \`dist\` for inspection
                       commands (audit/coverage/gaps); default \`src\` for \`mod\`.
  --json               JSON output instead of human-readable text.
  --state <path>       State file path (default: <cwd>/.prim-state.json).
  --update-state       Persist findings into the state file.
  --help, -h           Show this help.

\`mod\` OPTIONS
  --apply              Actually write file changes. Without this, runs as a
                       dry-run and prints the diff summary only.
  --include-guessed    Also rewrite prototype-method calls where the receiver
                       type was guessed from the identifier name. Off by
                       default — these need manual review.

EXAMPLES
  # See what you can migrate today in the local repo:
  prim coverage --target . --dir dist

  # See what to add to socket-lib's primordials next:
  prim gaps --target ../socket-cli

  # Persist a snapshot:
  prim audit --target ../socket-cli --update-state

  # Dry-run a codemod over the source tree:
  prim mod --target . --dir src

  # Apply for real (only after reviewing the dry-run):
  prim mod --target . --dir src --apply
`

// Argument schema. parseArgs in node:util gives us strict validation and
// `--key=value` parsing for free.
const ARG_OPTIONS = {
  target: { type: 'string' },
  dir: { type: 'string' },
  json: { type: 'boolean', default: false },
  state: { type: 'string' },
  'update-state': { type: 'boolean', default: false },
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
  // `mod` rewrites source; default to `src/`. Other commands inspect
  // bundled output by default; default to `dist/`.
  const dirDefault = command === 'mod' ? 'src' : 'dist'
  const dirArg = values.dir ?? dirDefault
  const json = values.json
  const updateState = values['update-state']
  const statePath = values.state ?? defaultStatePath()

  if (command === 'state') {
    showState(statePath, json)
    return
  }

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

  let surface
  try {
    surface = loadPrimordialsSurface(targetRoot)
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

  const findings = auditDirectory({
    targetRoot,
    scanDir,
    exported: surface.exports,
  })

  if (updateState) {
    const state = loadState(statePath)
    state.targets[path.basename(targetRoot)] = rollup(findings)
    saveState(statePath, state)
  }

  switch (command) {
    case 'audit':
      report(findings, json, path.basename(targetRoot), 'audit')
      break
    case 'coverage':
      report(
        findings.filter(f => f.kind === 'covered'),
        json,
        path.basename(targetRoot),
        'coverage',
      )
      break
    case 'gaps':
      report(
        findings.filter(f => f.kind === 'gap'),
        json,
        path.basename(targetRoot),
        'gaps',
      )
      break
    default:
      fail(`unknown command: ${command}\n\n${HELP}`)
  }
}

function report(findings, json, targetName, mode) {
  if (json) {
    process.stdout.write(
      formatJson({ targetName, mode, count: findings.length, findings }) + '\n',
    )
  } else {
    process.stdout.write(formatHuman(findings, { mode, targetName }) + '\n')
  }
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

function showState(statePath, json) {
  if (!existsSync(statePath)) {
    process.stdout.write(`state: no file at ${statePath}\n`)
    return
  }
  const state = loadState(statePath)
  if (json) {
    process.stdout.write(JSON.stringify(state, null, 2) + '\n')
    return
  }
  process.stdout.write(`state: ${statePath}\n`)
  process.stdout.write(`updated: ${state.updated}\n\n`)
  for (const [target, entry] of Object.entries(state.targets)) {
    process.stdout.write(`${target}\n`)
    process.stdout.write(`  coverage: ${entry.coverage.length} primordial(s)\n`)
    for (const c of entry.coverage.slice(0, 5)) {
      process.stdout.write(`    ${c.count}× ${c.primordial}\n`)
    }
    if (entry.coverage.length > 5) {
      process.stdout.write(`    … and ${entry.coverage.length - 5} more\n`)
    }
    process.stdout.write(`  gaps: ${entry.gaps.length} primordial(s)\n`)
    for (const g of entry.gaps.slice(0, 5)) {
      process.stdout.write(`    ${g.count}× ${g.primordial}\n`)
    }
    if (entry.gaps.length > 5) {
      process.stdout.write(`    … and ${entry.gaps.length - 5} more\n`)
    }
    process.stdout.write('\n')
  }
}

function fail(msg) {
  process.stderr.write(`prim: ${msg}\n`)
  process.exit(1)
}
