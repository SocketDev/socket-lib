/**
 * @file `socket-lib check primordials` handler. Loads a JSON config from disk
 *   (default `primordials-coverage.config.json` at the repo root, override with
 *   `--config <path>`), runs the drift check, and renders the result.
 *   socket-lib check primordials socket-lib check primordials --config
 *   ./primordials.config.json socket-lib check primordials --json #
 *   machine-readable output socket-lib check primordials --explain # one
 *   detailed line per finding socket-lib check primordials --silent # silent on
 *   success Exit codes: 0 — no drift 1 — drift detected (or config / lookup
 *   error)
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { errorMessage } from '../errors/message'
import { getDefaultLogger } from '../logger/default'
import { ArrayIsArray } from '../primordials/array'
import { ErrorCtor } from '../primordials/error'
import { JSONParse, JSONStringify } from '../primordials/json'
import { ObjectEntries } from '../primordials/object'
import {
  DEFAULT_ALIAS_MAP,
  DEFAULT_NODE_INTERNAL_ONLY,
} from '../checks/primordials-defaults'
import { checkPrimordials } from '../checks/primordials'
import type {
  PrimordialsCheckConfig,
  PrimordialsCheckResult,
  PrimordialsFinding,
} from '../checks/primordials'
import { parseArgs as parseLibArgs } from '../argv/parse'

import { MapCtor, SetCtor } from '../primordials/map-set'

const logger = getDefaultLogger()

// Default config name. We accept the root-level dotfile (the canonical
// `.<tool>rc.json` shape), the `.config/`-rooted variant (the Socket
// pattern for tooling configs), and the fleet-segmented `.config/repo/`
// location (repo-owned config now that fleet configs are split into
// fleet/ vs repo/ tiers). Look up in this order when `--config` was not
// explicitly passed, falling through to the next candidate if the file
// is missing — first hit wins. One file per repo for all socket-lib
// checks; section per check.
// At the repo root we use the canonical `.<tool>.json` dotfile shape.
// Inside `.config/`, the directory itself is already hidden, so the
// Socket convention drops the leading dot — every existing file under
// `.config/` (taze.config.mts, vitest.config.mts, tsconfig.base.json,
// ...) is bare-named. Match that.
const DEFAULT_CONFIG_PATH = '.socket-lib.json'
export const FALLBACK_CONFIG_PATHS: readonly string[] = [
  '.socket-lib.json',
  '.config/socket-lib.json',
  '.config/repo/socket-lib.json',
]
const CONFIG_SECTION = 'primordials'

export interface ParsedArgs {
  readonly config: string | undefined
  readonly json: boolean
  readonly explain: boolean
  readonly silent: boolean
  readonly help: boolean
}

export interface RawConfig {
  scanDirs?: unknown | undefined
  aliasMap?: unknown | undefined
  nodeInternalOnly?: unknown | undefined
  socketLibPrimordialsPath?: unknown | undefined
}

export interface SerializedFinding {
  kind: PrimordialsFinding['kind']
  name: string
  files: readonly string[]
  hint: string
}

export function loadConfig(configPath: string): PrimordialsCheckConfig {
  if (!existsSync(configPath)) {
    throw new ErrorCtor(`config file not found: ${configPath}`)
  }
  let parsed: unknown
  try {
    parsed = JSONParse(readFileSync(configPath, 'utf8'))
  } catch (e) {
    throw new ErrorCtor(`config file is not valid JSON: ${errorMessage(e)}`)
  }
  // The Socket convention is `.socket-lib.json` with a section per
  // check (primordials, paths, public-surface, ...). When the file
  // has the section, use it; otherwise treat the whole file as the
  // primordials config (back-compat with single-check setups).
  if (typeof parsed !== 'object' || parsed === null || ArrayIsArray(parsed)) {
    throw new ErrorCtor('config root must be an object')
  }
  const root = parsed as Record<string, unknown>
  const sectional = root[CONFIG_SECTION]
  const raw = (sectional !== undefined ? sectional : root) as RawConfig

  // Validate shape with concrete error messages — config files are
  // hand-edited and a misspelling here is the most common failure
  // mode. Don't let a wrong type slip through to the check engine.
  if (!ArrayIsArray(raw.scanDirs)) {
    throw new ErrorCtor(
      `config.scanDirs must be an array of strings (got ${typeof raw.scanDirs})`,
    )
  }
  for (const [i, v] of raw.scanDirs.entries()) {
    if (typeof v !== 'string') {
      throw new ErrorCtor(`config.scanDirs[${i}] must be a string`)
    }
  }
  if (
    raw.aliasMap !== undefined &&
    (typeof raw.aliasMap !== 'object' ||
      raw.aliasMap === null ||
      ArrayIsArray(raw.aliasMap))
  ) {
    throw new ErrorCtor('config.aliasMap must be an object of source→target')
  }
  if (
    raw.nodeInternalOnly !== undefined &&
    !ArrayIsArray(raw.nodeInternalOnly)
  ) {
    throw new ErrorCtor('config.nodeInternalOnly must be an array of strings')
  }

  // Merge the Socket-canonical defaults with the user's config. The user
  // map overlays the defaults — any key the user defines wins, but they
  // don't have to repeat the 26-entry boilerplate that every Socket repo
  // shares. The Map constructor consumes the entries in order, so the
  // user's later entries naturally overwrite the earlier defaults.
  const aliasMap = new MapCtor<string, string>([
    ...ObjectEntries(DEFAULT_ALIAS_MAP),
    ...ObjectEntries((raw.aliasMap ?? {}) as Record<string, string>),
  ])
  const nodeInternalOnly = new SetCtor<string>([
    ...DEFAULT_NODE_INTERNAL_ONLY,
    ...((raw.nodeInternalOnly ?? []) as string[]).filter(
      x => typeof x === 'string',
    ),
  ])

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

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { values } = parseLibArgs({
    args: argv,
    strict: false,
    options: {
      config: { type: 'string', short: 'c' },
      explain: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      silent: { type: 'boolean' },
    },
  })
  // `config` is left undefined when neither `--config` nor `-c` was
  // passed, so the resolver below can fall back to the search list.
  // An explicit value short-circuits the search.
  const explicitConfig = values['config']
  return {
    config: typeof explicitConfig === 'string' ? explicitConfig : undefined,
    json: Boolean(values['json']),
    explain: Boolean(values['explain']),
    silent: Boolean(values['silent']),
    help: Boolean(values['help']),
  }
}

export function printHelp(): void {
  logger.log('socket-lib check primordials — primordials drift check')
  logger.log('')
  logger.log('Usage:')
  logger.log('  socket-lib check primordials [opts]')
  logger.log('  socket-lib check prim        [opts]    # short alias')
  logger.log('')
  logger.log('Options:')
  logger.log(
    `  --config, -c <path>   Config file. Default: ${DEFAULT_CONFIG_PATH}`,
  )
  logger.log(
    `                        (falls back to .config/socket-lib.json, then .config/repo/socket-lib.json)`,
  ) // socket-lint: allow logger-decoration -- aligned --help usage text, matching the surrounding option lines
  logger.log('  --explain             Print one detailed line per finding.')
  logger.log('  --json                Machine-readable JSON output.')
  logger.log('  --silent              Silent on success.')
  logger.log('  --help, -h            Print this help.')
  logger.log('')
  logger.log('Config (.socket-lib.json — primordials section):')
  logger.log('  {')
  logger.log('    "primordials": {')
  logger.log(
    '      "scanDirs":         ["src", "additions/source-patched/lib"]',
  )
  logger.log('    }')
  logger.log('  }')
  logger.log('')
  logger.log('Only `scanDirs` is required. `aliasMap` and `nodeInternalOnly`')
  logger.log('default to the Socket-canonical sets and only need entries when')
  logger.log('your repo extends or overrides them.')
  logger.log('')
  logger.log('A bare object (no `primordials` section) is also accepted for')
  logger.log('repos that only run this one check.')
}

export function renderHuman(
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

/**
 * Pick the config file. Returns the explicit `--config` argument when given
 * (even if it doesn't exist — the caller will surface the error with the path
 * they typed). Otherwise probes the fallback list in order and returns the
 * first hit. Returns the head of the list when none exist, so the caller's
 * "config file not found" error message names the canonical default.
 *
 * `baseDir` is the directory the relative candidates resolve against; it
 * defaults to `process.cwd()` (the repo root the user runs from) and is a
 * parameter so callers/tests can probe a fixture tree without `process.chdir`.
 */
export function resolveConfigPath(
  explicit: string | undefined,
  baseDir: string = process.cwd(),
): string {
  if (explicit !== undefined) {
    return explicit
  }
  for (let i = 0, { length } = FALLBACK_CONFIG_PATHS; i < length; i += 1) {
    const candidate = FALLBACK_CONFIG_PATHS[i]!
    if (existsSync(path.resolve(baseDir, candidate))) {
      return candidate
    }
  }
  return FALLBACK_CONFIG_PATHS[0]!
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
    config = loadConfig(path.resolve(resolveConfigPath(args.config)))
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
    logger.log(JSONStringify(serialize(result), null, 2))
  } else {
    renderHuman(result, args)
  }
  return result.findings.length === 0 ? 0 : 1
}

export function serialize(result: PrimordialsCheckResult): {
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
