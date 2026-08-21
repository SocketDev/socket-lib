#!/usr/bin/env node
/*
 * @file Gate: `safeDelete`'s cwd-and-above guard stays ON by default.
 *
 *   `force` resolved as `opts.force !== false`, so it defaulted to TRUE and
 *   every caller passing no options ran with the guard disabled. The docblock
 *   promised the opposite. Measured: `safeDelete(dirAboveCwd)` with no options
 *   deleted the directory and its contents, outside the OS temp dir so no
 *   auto-force rule applied. That is the shape that removed a working checkout.
 *
 *   This asserts the BEHAVIOR, not the source text. A grep for
 *   `opts.force === true` would pass on a comment and break on a harmless
 *   refactor, and neither tells you what a caller actually gets. So the check
 *   builds a real directory outside the cwd and requires the delete to refuse
 *   it, which is the thing a consumer depends on.
 *
 *   Two properties, because either one alone is a trap:
 *
 *   1. A path outside the cwd is REFUSED without `force`. Otherwise the guard
 *      is decorative.
 *   2. A descendant of the cwd still deletes WITHOUT `force`. Otherwise the fix
 *      is a wall, every caller reaches for the flag, and that is worse than
 *      where it started.
 *
 *   Usage: node scripts/repo/check/force-delete-is-opt-in.mts [--quiet]
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
)

interface SafeFs {
  safeDelete: (
    filepath: string,
    options?: { force?: boolean | undefined } | undefined,
  ) => Promise<void>
}

// The methods this check uses, named rather than an index signature: an index
// signature types every read as possibly-undefined and forces bracket access.
interface CheckLogger {
  error: (message: string) => void
  fail: (message: string) => void
  group: () => void
  groupEnd: () => void
  log: (message: string) => void
  warn: (message: string) => void
}

interface LoggerFs {
  getDefaultLogger: () => CheckLogger
}

/**
 * Load the BUILT modules, the way a consumer does. Source specifiers use `.mjs`
 * names that resolve only after the build, and a guard asserted against source
 * would not describe what ships. Inside a function because the CJS bundle
 * target has no top-level await.
 */
async function loadBuilt(): Promise<{ log: LoggerFs; safe: SafeFs }> {
  const safe = (await import(
    pathToFileURL(path.join(REPO_ROOT, 'dist', 'fs', 'safe.js')).href
  )) as SafeFs
  const log = (await import(
    pathToFileURL(path.join(REPO_ROOT, 'dist', 'logger', 'default.js')).href
  )) as LoggerFs
  return { log, safe }
}

/**
 * Whether a delete of `target` was refused. A refusal is the pass condition, so
 * the resolve arm is the failure.
 */
export async function refusesDelete(
  safe: SafeFs,
  target: string,
): Promise<boolean> {
  try {
    await safe.safeDelete(target)
    return false
  } catch {
    return true
  }
}

export interface GuardFinding {
  readonly detail: string
  readonly property: string
}

/**
 * Exercise both properties against a real tree. `root` is the directory the
 * probes are built under; the caller owns cleaning it up.
 */
export async function probeDeleteGuard(config: {
  readonly cwd: string
  readonly root: string
  readonly safe: SafeFs
}): Promise<GuardFinding[]> {
  const { cwd, root, safe } = { __proto__: null, ...config } as typeof config
  const findings: GuardFinding[] = []

  // 1. Outside the cwd must be refused. A sibling of cwd, created here, so a
  // regression can only cost this probe.
  const outside = path.join(root, `outside-${process.pid}`)
  mkdirSync(outside, { recursive: true })
  writeFileSync(path.join(outside, 'precious.txt'), 'keep')
  if (!(await refusesDelete(safe, outside))) {
    findings.push({
      detail: `safeDelete removed ${outside}, which is outside the cwd, with no force flag`,
      property: 'refuses outside cwd',
    })
  }
  // The probe sits outside cwd by design, so clearing it needs the flag.
  // oxlint-disable-next-line socket/no-force-delete -- probe is outside cwd
  await safe.safeDelete(outside, { force: true })

  // 2. A descendant of the cwd must still delete with no flag, or every caller
  // starts passing force and the guard buys nothing.
  const inside = path.join(cwd, `force-optin-probe-${process.pid}`)
  mkdirSync(inside, { recursive: true })
  writeFileSync(path.join(inside, 'x.txt'), 'x')
  try {
    await safe.safeDelete(inside)
  } catch {
    // Swallowed: the finding below is the report, and a throw here would hide
    // the second property behind the first.
  }
  if (existsSync(inside)) {
    findings.push({
      detail: `safeDelete refused ${inside}, a descendant of the cwd, which must not need force`,
      property: 'allows inside cwd',
    })
    // oxlint-disable-next-line socket/no-force-delete -- refused above
    await safe.safeDelete(inside, { force: true })
  }

  return findings
}

export async function main(): Promise<void> {
  const isQuiet = process.argv.includes('--quiet')
  const { log, safe } = await loadBuilt()
  const logger = log.getDefaultLogger()
  // del resolves its guard against the REAL cwd, so the property under test is
  // cwd-relative and cannot be anchored on import.meta.url. Asserted equal to
  // the repo root, which is where the check runner runs it, so a probe never
  // lands somewhere unexpected.
  // oxlint-disable-next-line socket/no-process-cwd-in-scripts-hooks -- the guard is cwd-relative
  const cwd = process.cwd()
  if (path.resolve(cwd) !== REPO_ROOT) {
    logger.warn(
      `[force-delete-is-opt-in] skipped: run from the repo root (cwd is ${cwd}); the guard under test is cwd-relative.`,
    )
    return
  }
  // Beside the repo, never inside a temp dir: the temp dir auto-forces, which
  // would make property 1 pass for the wrong reason.
  const findings = await probeDeleteGuard({
    cwd,
    root: path.join(REPO_ROOT, '..'),
    safe,
  })
  if (findings.length) {
    logger.fail(
      `[force-delete-is-opt-in] ${findings.length} broken guard property(s).`,
    )
    logger.group()
    for (const finding of findings) {
      logger.error(`${finding.property}: ${finding.detail}`)
    }
    logger.error(
      'Fix: `force` must resolve as `opts.force === true` in src/fs/safe.mts. A `!== false` spelling defaults it ON and disables the guard for every caller.',
    )
    logger.groupEnd()
    process.exitCode = 1
    return
  }
  if (!isQuiet) {
    logger.log(
      '[force-delete-is-opt-in] ok — outside the cwd is refused, inside still deletes',
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main()
}
