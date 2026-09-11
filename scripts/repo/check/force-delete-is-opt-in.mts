#!/usr/bin/env node
/**
 * @file Check the built safeDelete containment contract.
 *   A path outside cwd must be refused without options. A descendant of cwd
 *   must remain deletable. Cleanup authorizes only the probe directory.
 *   Usage: node scripts/repo/check/force-delete-is-opt-in.mts [--quiet]
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { isPathWithinRoot } from '@socketsecurity/lib-stable/paths/predicates'
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
    options?: { allowedDirs?: readonly string[] | undefined } | undefined,
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
      detail: `safeDelete removed ${outside}, which is outside the cwd, with no options`,
      property: 'refuses outside cwd',
    })
  }
  await safe.safeDelete(outside, { allowedDirs: [outside] })

  // A descendant must delete without additional options.
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
      detail: `safeDelete refused ${inside}, a descendant of the cwd, which must not need additional options`,
      property: 'allows inside cwd',
    })
    await safe.safeDelete(inside, { allowedDirs: [inside] })
  }

  return findings
}

export function prepareDeleteFixtureRoot(repoRoot: string): string {
  const cache = path.join(repoRoot, '.cache')
  const fixtureBase = path.join(cache, 'delete-guard')
  for (const candidate of [cache, fixtureBase]) {
    if (
      existsSync(candidate) &&
      !isPathWithinRoot(realpathSync(candidate), realpathSync(repoRoot))
    ) {
      throw new Error(
        'Delete fixture escapes the repository. Fix: remove the escaping cache symlink before running the check.',
      )
    }
  }
  mkdirSync(fixtureBase, { recursive: true })
  return fixtureBase
}

export async function main(): Promise<void> {
  const isQuiet = process.argv.includes('--quiet')
  const { log, safe } = await loadBuilt()
  const logger = log.getDefaultLogger()
  const fixtureBase = prepareDeleteFixtureRoot(REPO_ROOT)
  if (!process.argv.includes('--probe-child')) {
    const fixture = mkdtempSync(path.join(fixtureBase, 'probe-'))
    const cwd = path.join(fixture, 'cwd')
    mkdirSync(cwd)
    try {
      await spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          '--probe-child',
          ...(isQuiet ? ['--quiet'] : []),
        ],
        { cwd, stdio: 'inherit' },
      )
    } finally {
      await safe.safeDelete(fixture, { allowedDirs: [fixture] })
    }
    return
  }
  // oxlint-disable-next-line socket/no-process-cwd-in-scripts-hooks -- the guard is cwd-relative
  const cwd = process.cwd()
  if (
    !isPathWithinRoot(realpathSync(cwd), realpathSync(fixtureBase)) ||
    path.basename(cwd) !== 'cwd'
  ) {
    throw new Error(
      'Delete probe cwd is invalid. Where: child probe. Saw an external working directory; wanted the repository fixture child. Fix: run the check from the repository root.',
    )
  }
  const findings = await probeDeleteGuard({
    cwd,
    root: path.dirname(cwd),
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
      'Fix: preserve containment in src/fs/safe.mts. Only the forceDelete runner or an allowed directory may bypass the cwd boundary.',
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
