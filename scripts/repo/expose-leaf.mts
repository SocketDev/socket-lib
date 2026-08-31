#!/usr/bin/env node
/*
 * @file Un-stub a leaf the fleet turned out to need, and stage the release
 *   that ships it.
 *
 *   The remediation half of the build-stub loop. A leaf no fleet consumer
 *   imported is compiled out of the published build; its exports keep their
 *   names but throw on FIRST USE, so the moment a consumer actually calls one
 *   it gets `<name> is compiled out of this @socketsecurity/lib build`. That
 *   error is the signal, and this script is what it should point at: it takes
 *   the leaf back off the stub list, rebuilds so dist carries the real
 *   implementation, and commits — leaving only the release to cut.
 *
 *   Why a script rather than an issue link: the fix is mechanical and
 *   identical every time, so a human hand-editing JSON is a step that can go
 *   wrong. Editing the list without rebuilding leaves dist still throwing, and
 *   the pair only agree when the same command does both.
 *
 *   Does NOT release. Every fleet release takes a user-named version, so this
 *   prints the exact pipeline command and stops. The one judgement call in the
 *   loop stays with a person.
 *
 *   Usage: node scripts/repo/expose-leaf.mts <leaf>… [--no-commit] [--dry-run]
 *     leaf   the exports-map specifier without the leading `./`,
 *            e.g. http-request/checksum-file
 *   Exit: 0 exposed (or already exposed); 1 unknown leaf or a failed rebuild.
 */

import { writeFileSync } from 'node:fs'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { exportLeaves } from './audit-fleet-lib-usage.mts'
import {
  readScannedRoster,
  readUnexposedLeaves,
} from './build-stubs/unexposed.mts'
import { writeUnexposedLeaves } from './build-stubs/settings.mts'

import type { UnexposedRecord } from './build-stubs/settings.mts'
import { isMainModule } from '../fleet/process/is-main-module.mts'
import { runMain } from '../fleet/process/run-main.mts'
import { REPO_ROOT } from '../fleet/paths.mts'

import type { ScriptMeta } from '../fleet/process/run-main.mts'

const logger = getDefaultLogger()

export interface ExposeResult {
  // Leaves removed from the stub list by this run.
  exposed: string[]
  // Leaves asked for that were already un-stubbed — not an error, since the
  // point is the end state.
  alreadyExposed: string[]
  // Leaves that are not in the exports map at all.
  unknown: string[]
}

/**
 * Partition requested leaves against the current list and exports map. Pure so
 * the decision is testable without touching disk or running a build.
 */
export function planExposure(
  requested: readonly string[],
  listedLeaves: readonly string[],
  exportedLeaves: readonly string[],
): ExposeResult {
  const listed = new Set(listedLeaves)
  const exported = new Set(exportedLeaves)
  const result: ExposeResult = {
    alreadyExposed: [],
    exposed: [],
    unknown: [],
  }
  for (let i = 0, { length } = requested; i < length; i += 1) {
    const leaf = requested[i]!
    if (!exported.has(leaf)) {
      result.unknown.push(leaf)
    } else if (listed.has(leaf)) {
      result.exposed.push(leaf)
    } else {
      result.alreadyExposed.push(leaf)
    }
  }
  return result
}

/**
 * The stub list with `remove` taken out, preserving the roster record so the
 * coverage check still knows what evidence produced the remaining entries.
 */
export function recordWithoutLeaves(
  leaves: readonly string[],
  scannedRoster: readonly string[],
  remove: readonly string[],
): UnexposedRecord {
  const drop = new Set(remove)
  return {
    leaves: leaves.filter(leaf => !drop.has(leaf)),
    scannedRoster: [...scannedRoster],
  }
}

function main(): void {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const noCommit = argv.includes('--no-commit')
  const requested = argv.filter(a => !a.startsWith('-'))
  if (!requested.length) {
    logger.fail(
      'expose-leaf: no leaf named.\n' +
        '  Where: the command line.\n' +
        '  Saw: no positional argument; wanted one or more exports-map leaves.\n' +
        '  Fix: node scripts/repo/expose-leaf.mts http-request/checksum-file',
    )
    process.exitCode = 1
    return
  }
  const listed = readUnexposedLeaves(REPO_ROOT)
  const plan = planExposure(requested, listed, exportLeaves(REPO_ROOT))
  if (plan.unknown.length) {
    logger.fail(
      `expose-leaf: ${plan.unknown.join(', ')} is not in the exports map.\n` +
        '  Where: package.json "exports".\n' +
        '  Saw: a leaf this package does not publish; wanted an existing exports-map entry.\n' +
        '  Fix: check the specifier — it is the exports key without the leading `./`.',
    )
    process.exitCode = 1
    return
  }
  for (let i = 0, { length } = plan.alreadyExposed; i < length; i += 1) {
    logger.info(
      `expose-leaf: ${plan.alreadyExposed[i]} is already exposed — nothing to do.`,
    )
  }
  if (!plan.exposed.length) {
    return
  }
  if (dryRun) {
    logger.info(
      `expose-leaf: [dry-run] would expose ${plan.exposed.join(', ')} and rebuild.`,
    )
    return
  }
  writeUnexposedLeaves(
    REPO_ROOT,
    recordWithoutLeaves(listed, readScannedRoster(REPO_ROOT), plan.exposed),
    writeFileSync,
  )
  logger.success(
    `expose-leaf: removed ${plan.exposed.join(', ')} from the stub list.`,
  )

  // Rebuild in the same command. The list and dist only agree when one step
  // does both — editing the list alone leaves dist still throwing, which is
  // the failure the stub-vs-list check exists to catch.
  const build = spawnSync('pnpm', ['run', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
  if (build.status !== 0) {
    logger.fail(
      'expose-leaf: the rebuild failed, so dist still ships the throwing stub.\n' +
        `  Where: \`pnpm run build\` in ${REPO_ROOT}.\n` +
        '  Saw: a non-zero build exit; wanted a dist carrying the real implementation.\n' +
        '  Fix: read the build output above, resolve it, then re-run this command.',
    )
    process.exitCode = 1
    return
  }
  if (!noCommit) {
    const paths = ['.config/repo/socket-wheelhouse.json']
    const subject = `fix(build-stubs): expose ${plan.exposed.join(', ')} for fleet consumers`
    const commit = spawnSync('git', ['commit', '-o', ...paths, '-m', subject], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    })
    if (commit.status !== 0) {
      logger.warn(
        'expose-leaf: the list changed but the commit did not land — commit it yourself.',
      )
    }
  }
  logger.info(
    'expose-leaf: next, cut the release that ships it. The version is a human\n' +
      '  call, so this script stops here:\n' +
      '    node scripts/fleet/release-pipeline.mts --version <X.Y.Z>\n' +
      '    node scripts/fleet/publish-pipeline.mts',
  )
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'un-stubs a leaf the fleet needs, rebuilds, and commits — stops before the release',
  help: `Usage: node scripts/repo/expose-leaf.mts <leaf>… [flags]

  leaf          the exports-map specifier without the leading ./,
                e.g. http-request/checksum-file
  --no-commit   skip committing the stub-list change
  --dry-run     report what would be exposed without writing or rebuilding`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
