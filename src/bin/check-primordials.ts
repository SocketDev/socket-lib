/**
 * @fileoverview `socket-lib check primordials` handler.
 *
 * Loads a JSON config from disk (default
 * `primordials-coverage.config.json` at the repo root, override with
 * `--config <path>`), runs the drift check, and renders the result.
 *
 *   socket-lib check primordials
 *   socket-lib check primordials --config ./primordials.config.json
 *   socket-lib check primordials --json     # machine-readable output
 *   socket-lib check primordials --explain  # one detailed line per finding
 *   socket-lib check primordials --silent   # silent on success
 *
 * Exit codes:
 *   0 — no drift
 *   1 — drift detected (or config / lookup error)
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { errorMessage } from '../errors'
import { getDefaultLogger } from '../logger'
import {
  type PrimordialsCheckConfig,
  type PrimordialsCheckResult,
  type PrimordialsFinding,
  checkPrimordials,
} from '../checks/primordials'
import { parseArgs as parseLibArgs } from '../argv/parse'

const logger = getDefaultLogger()

// Lives in `.config/` next to tsconfig.base.json, taze.config.mts,
// etc. — the existing fleet pattern for tooling configs that
// consumers read. One file per repo for all socket-lib checks;
// section per check.
const DEFAULT_CONFIG_PATH = '.config/socket-lib.json'
const CONFIG_SECTION = 'primordials'

interface ParsedArgs {
  readonly config: string
  readonly json: boolean
  readonly explain: boolean
  readonly silent: boolean
  readonly help: boolean
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const { values } = parseLibArgs({
    args: argv,
    strict: false,
    options: {
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      explain: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      silent: { type: 'boolean' },
    },
  })
  return {
    config: String(values['config'] ?? DEFAULT_CONFIG_PATH),
    json: Boolean(values['json']),
    explain: Boolean(values['explain']),
    silent: Boolean(values['silent']),
    help: Boolean(values['help']),
  }
}

function printHelp(): void {
  logger.log('socket-lib check primordials — primordials drift check')
  logger.log('')
  logger.log('Usage:')
  logger.log('  socket-lib check primordials [opts]')
  logger.log('  socket-lib check prim        [opts]    # short alias')
  logger.log('')
  logger.log('Options:')
  logger.log(
    `  --config <path>   Config file. Default: ${DEFAULT_CONFIG_PATH}`,
  )
  logger.log('  --explain         Print one detailed line per finding.')
  logger.log('  --json            Machine-readable JSON output.')
  logger.log('  --quiet           Silent on success.')
  logger.log('  --help, -h        Print this help.')
  logger.log('')
  logger.log('Config (.config/socket-lib.json — primordials section):')
  logger.log('  {')
  logger.log('    "primordials": {')
  logger.log('      "aliasMap":         { "Array": "ArrayCtor" },')
  logger.log('      "nodeInternalOnly": ["SafeMap", "SafeSet"],')
  logger.log('      "scanDirs":         ["src", "additions/source-patched/lib"]')
  logger.log('    }')
  logger.log('  }')
  logger.log('')
  logger.log('A bare object (no `primordials` section) is also accepted for')
  logger.log('repos that only run this one check.')
}

interface RawConfig {
  scanDirs?: unknown
  aliasMap?: unknown
  nodeInternalOnly?: unknown
  socketLibPrimordialsPath?: unknown
}

function loadConfig(configPath: string): PrimordialsCheckConfig {
  if (!existsSync(configPath)) {
    throw new Error(`config file not found: ${configPath}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (e) {
    throw new Error(`config file is not valid JSON: ${errorMessage(e)}`)
  }
  // The fleet convention is `.socket-lib.json` with a section per
  // check (primordials, paths, public-surface, ...). When the file
  // has the section, use it; otherwise treat the whole file as the
  // primordials config (back-compat with single-check setups).
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error('config root must be an object')
  }
  const root = parsed as Record<string, unknown>
  const sectional = root[CONFIG_SECTION]
  const raw = (
    sectional !== undefined ? sectional : root
  ) as RawConfig

  // Validate shape with concrete error messages — config files are
  // hand-edited and a misspelling here is the most common failure
  // mode. Don't let a wrong type slip through to the check engine.
  if (!Array.isArray(raw.scanDirs)) {
    throw new Error(
      `config.scanDirs must be an array of strings (got ${typeof raw.scanDirs})`,
    )
  }
  for (const [i, v] of raw.scanDirs.entries()) {
    if (typeof v !== 'string') {
      throw new Error(`config.scanDirs[${i}] must be a string`)
    }
  }
  if (
    raw.aliasMap !== undefined &&
    (typeof raw.aliasMap !== 'object' ||
      raw.aliasMap === null ||
      Array.isArray(raw.aliasMap))
  ) {
    throw new Error('config.aliasMap must be an object of source→target')
  }
  if (raw.nodeInternalOnly !== undefined && !Array.isArray(raw.nodeInternalOnly)) {
    throw new Error('config.nodeInternalOnly must be an array of strings')
  }

  const aliasMap = new Map<string, string>(
    Object.entries((raw.aliasMap ?? {}) as Record<string, string>),
  )
  const nodeInternalOnly = new Set(
    ((raw.nodeInternalOnly ?? []) as string[]).filter(
      x => typeof x === 'string',
    ),
  )

  // repoRoot is where scanDirs are resolved from. Default to cwd —
  // the user runs `socket-lib check prim` from their repo root.
  // Override via config if the config lives somewhere unusual.
  return {
    scanDirs: raw.scanDirs as string[],
    aliasMap,
    nodeInternalOnly,
    socketLibPrimordialsPath:
      typeof raw.socketLibPrimordialsPath === 'string'
        ? raw.socketLibPrimordialsPath
        : undefined,
    repoRoot: process.cwd(),
  }
}

interface SerializedFinding {
  kind: PrimordialsFinding['kind']
  name: string
  files: readonly string[]
  hint: string
}

function serialize(result: PrimordialsCheckResult): {
  ok: boolean
  used: number
  findings: SerializedFinding[]
} {
  return {
    ok: result.findings.length === 0,
    used: result.used.size,
    findings: result.findings.map(f => ({
      kind: f.kind,
      name: f.name,
      files: f.files,
      hint: f.hint,
    })),
  }
}

function renderHuman(
  result: PrimordialsCheckResult,
  args: ParsedArgs,
): void {
  if (result.findings.length === 0) {
    if (!args.silent) {
      logger.success(
        `Primordials coverage OK — ${result.used.size} names used, all accounted for.`,
      )
    }
    return
  }
  logger.error(
    `Primordials drift detected — ${result.findings.length} unaccounted name(s):`,
  )
  for (const f of result.findings) {
    logger.error(`  ${f.name}`)
    if (args.explain) {
      logger.error(`    ${f.hint}`)
      if (f.files.length > 0) {
        logger.error(`    files: ${f.files.join(', ')}`)
      }
    }
  }
  if (!args.explain) {
    logger.error('')
    logger.error('Run with --explain for fix instructions and file references.')
  }
}

export async function runCheckPrimordials(
  argv: readonly string[],
): Promise<number> {
  const args = parseArgs(argv)
  if (args.help) {
    printHelp()
    return 0
  }
  let config: PrimordialsCheckConfig
  try {
    config = loadConfig(path.resolve(args.config))
  } catch (e) {
    logger.error(`socket-lib check primordials: ${errorMessage(e)}`)
    return 1
  }
  let result: PrimordialsCheckResult
  try {
    result = checkPrimordials(config)
  } catch (e) {
    logger.error(`socket-lib check primordials: ${errorMessage(e)}`)
    return 1
  }
  if (args.json) {
    logger.log(JSON.stringify(serialize(result), null, 2))
  } else {
    renderHuman(result, args)
  }
  return result.findings.length === 0 ? 0 : 1
}
