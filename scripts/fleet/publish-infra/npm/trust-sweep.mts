/**
 * @file Bulk trusted-publisher sweep over `npm trust` — the registry API
 *   lane. The browser driver cannot WRITE these settings anymore: npm's bot
 *   management blocks state-changing transactions from a CDP-driven browser
 *   (saves silently never land; observed 2026-07-31, 132/132 failed), and
 *   the access-page challenges carry no cooldown opt-in. `npm trust` wraps
 *   the documented registry endpoints, is designed for bulk loops, and its
 *   web-2FA flow DOES carry the cooldown checkbox — so the sweep runs
 *   unchallenged inside the operator's approval window and the PTY wrapper
 *   re-opens the browser when the window lapses.
 *   The law per @socketregistry package matches the shape the browser plan
 *   derived: github · file npm-publish.yml · repo SocketDev/socket-registry ·
 *   environment npm-publish · permissions createPackage +
 *   createStagedPackage. The create endpoint 409s on an existing config, so
 *   a stale config (the dead `_local-not-for-reuse-provenance.yml` one-off)
 *   is REVOKED first — delete-and-recreate is the API's own contract, and
 *   deleting the stale reference is the point.
 *   Dry-run by default; `--drive` performs revoke + create. Fail-soft per
 *   package, 2s spacing (the npm-trust docs' rate-limit guidance), summary
 *   at the end, non-zero exit if anything failed. Verification is the
 *   registry's own answer: a post-create `npm trust list` must echo the law.
 *   Usage: node scripts/fleet/publish-infra/npm/trust-sweep.mts
 *   [<pkg>…] [--socket-registry] [--drive]
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { errorMessage } from '@socketsecurity/lib-stable/errors/message'

import { isMainModule } from '../../_shared/is-main-module.mts'
import { logger, runCapture } from '../shared.mts'
import { npmScratchCwd } from './shared.mts'
import { sleep } from './browser-session.mts'
import { expandSocketRegistryWorklist } from './trusted-publisher-browser.mts'

// The fleet law for @socketregistry packages, stated once.
const LAW = {
  environment: 'npm-publish',
  file: 'npm-publish.yml',
  permissions: ['createPackage', 'createStagedPackage'],
  repository: 'SocketDev/socket-registry',
  type: 'github',
} as const

const PACE_MS = 2000

interface TrustConfig {
  environment?: string | undefined
  file?: string | undefined
  id?: string | undefined
  permissions?: string[] | undefined
  repository?: string | undefined
  type?: string | undefined
}

type SweepStatus = 'applied' | 'conforms' | 'failed' | 'planned'

interface SweepResult {
  detail?: string | undefined
  pkg: string
  status: SweepStatus
}

/**
 * Whether an existing config already IS the law — the conforming no-op that
 * makes the sweep idempotent and re-runnable after partial failures.
 */
export function conformsToLaw(config: TrustConfig): boolean {
  const perms = [...(config.permissions ?? [])].toSorted()
  const wanted = [...LAW.permissions].toSorted()
  return (
    config.type === LAW.type &&
    config.file === LAW.file &&
    config.repository === LAW.repository &&
    config.environment === LAW.environment &&
    perms.length === wanted.length &&
    perms.every((p, i) => p === wanted[i])
  )
}

// The PTY auth wrapper: `npm trust` create/revoke are 2FA-gated, and the
// wrapper opens the browser when the cooldown window lapses. Resolved
// relative to THIS file so the sweep works from any cwd.
const AUTH_WRAPPER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../npm-web-auth.mts',
)

async function npmTrust(
  args: string[],
): Promise<{ code: number; stdout: string }> {
  // Through the wrapper for the 2FA-gated writes; scratch cwd dodges the
  // repo's devEngines pnpm veto.
  return await runCapture(
    process.execPath,
    [AUTH_WRAPPER, 'trust', ...args],
    npmScratchCwd(),
  )
}

async function trustList(pkg: string): Promise<TrustConfig | undefined> {
  const { code, stdout } = await runCapture(
    'npm',
    ['trust', 'list', pkg, '--json'],
    npmScratchCwd(),
  )
  if (code !== 0) {
    return undefined
  }
  const jsonStart = stdout.indexOf('{')
  if (jsonStart === -1) {
    return undefined
  }
  try {
    return JSON.parse(stdout.slice(jsonStart)) as TrustConfig
  } catch {
    return undefined
  }
}

/**
 * Sweep one package to the law: conforming configs no-op; a stale config is
 * revoked by id, the law created, and the registry re-read must echo it —
 * success is the registry's answer, never the exit code alone.
 */
export async function sweepOne(
  pkg: string,
  config: { drive: boolean },
): Promise<SweepResult> {
  const cfg = { __proto__: null, ...config } as typeof config
  try {
    const current = await trustList(pkg)
    if (current && conformsToLaw(current)) {
      return { pkg, status: 'conforms' }
    }
    if (!cfg.drive) {
      const from = current
        ? `${current.file ?? '(none)'} / env ${current.environment ?? '(empty)'}`
        : '(no config)'
      return {
        detail: `[dry-run] ${from} -> ${LAW.file} / env ${LAW.environment}`,
        pkg,
        status: 'planned',
      }
    }
    if (current?.id) {
      const revoke = await npmTrust(['revoke', pkg, `--id=${current.id}`])
      if (revoke.code !== 0) {
        return { detail: `revoke exited ${revoke.code}`, pkg, status: 'failed' }
      }
    }
    const create = await npmTrust([
      'github',
      pkg,
      '--file',
      LAW.file,
      '--repo',
      LAW.repository,
      '--env',
      LAW.environment,
      '--allow-publish',
      '--allow-stage-publish',
      '--yes',
    ])
    if (create.code !== 0) {
      return { detail: `create exited ${create.code}`, pkg, status: 'failed' }
    }
    const echoed = await trustList(pkg)
    if (!echoed || !conformsToLaw(echoed)) {
      return {
        detail: 'registry re-read does not echo the law after create',
        pkg,
        status: 'failed',
      }
    }
    return { pkg, status: 'applied' }
  } catch (e) {
    return { detail: errorMessage(e), pkg, status: 'failed' }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const drive = argv.includes('--drive')
  const socketRegistry = argv.includes('--socket-registry')
  const packages = argv.filter(a => !a.startsWith('--'))
  if (socketRegistry) {
    packages.push(...(await expandSocketRegistryWorklist()))
  }
  if (packages.length === 0) {
    logger.fail('no packages: pass names or --socket-registry.')
    process.exitCode = 1
    return
  }
  logger.log(
    `npm trust sweep — ${packages.length} package(s)${drive ? ' [drive]' : ' [dry-run]'}`,
  )
  const counts: Record<SweepStatus, number> = {
    applied: 0,
    conforms: 0,
    failed: 0,
    planned: 0,
  }
  for (let i = 0, { length } = packages; i < length; i += 1) {
    const pkg = packages[i]!
    // eslint-disable-next-line no-await-in-loop -- serial by design: the npm-trust docs' rate-limit guidance.
    const result = await sweepOne(pkg, { drive })
    counts[result.status] += 1
    const line = `${result.pkg}: ${result.status}${result.detail ? ` — ${result.detail}` : ''}`
    if (result.status === 'failed') {
      logger.fail(line)
    } else {
      logger.log(line)
    }
    if (i < length - 1) {
      // eslint-disable-next-line no-await-in-loop -- pacing between registry writes.
      await sleep(PACE_MS)
    }
  }
  logger.log('')
  logger.log(
    `Trust-sweep ${drive ? 'drive' : 'dry-run'} summary: ${counts.applied} applied, ` +
      `${counts.planned} planned, ${counts.conforms} conforming, ${counts.failed} failed.`,
  )
  if (counts.failed > 0) {
    process.exitCode = 1
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e: unknown) => {
    logger.fail(errorMessage(e))
    process.exitCode = 1
  })
}
