#!/usr/bin/env node
/*
 * @file Npm Trusted Publisher settings driver — reads and mass-applies the
 *   fleet's canonical GitHub Actions trusted-publisher config across packages
 *   through bounded browser-bridge operations against
 *   `https://www.npmjs.com/package/<pkg>/access`. Modes: `read <pkg…>` prints each package's
 *   CURRENT form values as a table (read-only); `apply <pkg…>` prints the
 *   current-to-desired diff per package and is DRY-RUN BY DEFAULT — `--drive` (the agent takes the wheel of your signed-in session)
 *   fills the form (workflow filename, environment name, allowed-action
 *   checkboxes) and clicks Save, then RE-READS the form and only counts the
 *   package done when the saved state matches desired: success is the page's
 *   answer, never the click. `--socket-registry` expands the worklist to
 *   every owned @socketregistry/* package from socket-registry's immutable
 *   committed `packages/npm/<package>/package.json` manifest blobs.
 *   Fail-soft per package: one failure never aborts the batch; a summary
 *   prints at the end. The pure planners live in
 *   `trusted-publisher/parse.mts` + `trusted-publisher/plan.mts`. The sign-in and
 *   challenge contract — reuse the seeded session, PAUSE a human-verification
 *   challenge for the operator instead of blind-retrying — is owned by
 *   the browser bridge; see
 *   `docs/fleet/agents.md/npm-anti-bot-rhythm.md`.
 *   Usage: node scripts/fleet/registry-infra/npm/settings/trusted-publisher/browser.mts
 *   read|apply [<pkg>…] [--socket-registry] [--drive] [--repo <owner/name>]
 *   [--workflow <file.yml>] [--environment <name>]
 */

import { getScriptArgs } from '../../../../process/script-output.mts'
import process from 'node:process'

import { errorMessage } from '@socketsecurity/lib-stable/errors/message'

import { isMainModule } from '../../../../process/is-main-module.mts'
import { runMain } from '../../../../process/run-main.mts'
import type { ScriptMeta } from '../../../../process/run-main.mts'
import { logger } from '../../../shared.mts'
import type { BrowserTask } from '../../../../browser/bridge.mts'
import { withBrowserTask } from '../../../../browser/bridge.mts'
import {
  desiredTrustedPublisher,
  diffTrustedPublisher,
  formatApplySummary,
  formatPartialSaveFailure,
  LEGACY_WORKFLOW_FILENAMES,
  renderPlannedEdits,
  renderReadTable,
  verifySavedState,
} from './plan.mts'
import type { AccessReadRow, ApplyResult } from './plan.mts'
import { PUBLISH_FIRST } from '../migrations.mts'
import {
  parseTrustedPublisherBridgeResult,
  trustedPublisherBridgeBinding,
} from './parse.mts'
import type { TrustedPublisherCurrent } from './parse.mts'
import { readPublisherNapiPlatforms } from '../publisher-source.mts'
import {
  parseTrustedPublisherArgs,
  TRUSTED_PUBLISHER_USAGE,
} from './arguments.mts'
import { readSocketRegistryWorklist } from './worklist.mts'

const NPM_ORIGIN = 'https://www.npmjs.com'

function bindingMatchesRepository(
  binding: TrustedPublisherCurrent,
  repository: string,
): boolean {
  return `${binding.repositoryOwner}/${binding.repositoryName}` === repository
}

export function accessUrl(pkg: string): string {
  return `${NPM_ORIGIN}/package/${encodeURIComponent(pkg)}/access`
}
async function readTrustedPublisher(task: BrowserTask, pkg: string) {
  let result = await task.action('npm.trusted-publisher.read', {
    packageName: pkg,
  })
  if (result['state'] === 'challenge') {
    const outcome = await task.help(
      `Complete npm human verification for ${pkg}, then choose Completed.`,
    )
    if (outcome !== 'completed') {
      throw new Error(`npm trusted-publisher challenge ${outcome}`)
    }
    result = await task.action('npm.trusted-publisher.read', {
      packageName: pkg,
    })
  }
  return parseTrustedPublisherBridgeResult(result)
}
async function withTrustedPublisherTask<T>(
  pkg: string,
  run: (task: BrowserTask) => Promise<T>,
): Promise<T> {
  return await withBrowserTask(
    { targetUrl: accessUrl(pkg), taskName: 'npm-trusted-publisher' },
    run,
  )
}

/**
 * Plan (and with `drive`, perform + verify) one package's trusted-publisher
 * update. Never throws — every outcome is an ApplyResult so the batch keeps
 * moving. `resolveNapiPlatforms` (when supplied) reads the derived repo's
 * `napi.platforms` so a napi platform package targets the napi workflow; its
 * absence keeps the js workflow.
 */
export async function applyOne(
  pkg: string,
  config: {
    drive: boolean
    environmentOverride?: string | undefined
    repoOverride?: string | undefined
    resolveNapiPlatforms?:
      | ((repository: string) => Promise<readonly string[]>)
      | undefined
    workflowOverride?: string | undefined
  },
): Promise<ApplyResult> {
  const cfg = { __proto__: null, ...config } as typeof config
  try {
    // eslint-disable-next-line complexity -- reconciliation lifecycle
    return await withTrustedPublisherTask(pkg, async task => {
      const read = await readTrustedPublisher(task, pkg)
      const { bindings, state } = read
      let current = read.current
      if (!current && bindings.length) {
        const repositories = new Set(
          bindings.map(
            binding =>
              `${binding.repositoryOwner ?? ''}/${binding.repositoryName ?? ''}`,
          ),
        )
        if (repositories.size === 1) {
          current = bindings[0]
        }
      }
      const provisional = desiredTrustedPublisher({
        current,
        environmentOverride: cfg.environmentOverride,
        pkg,
        repoOverride: cfg.repoOverride,
        workflowOverride: cfg.workflowOverride,
      })
      if (!provisional) {
        if (bindings.length) {
          return {
            __proto__: null,
            detail:
              'trusted-publisher rows named multiple repositories, and no verified target selected one; no row was changed or deleted',
            pkg,
            status: 'failed',
          }
        }
        return {
          __proto__: null,
          detail:
            `${state} and no repo derivable — pass --repo <owner/name> ` +
            'for a non-@socketregistry package with no configured repo.',
          pkg,
          status: 'skipped',
        }
      }
      const napiPlatforms = cfg.resolveNapiPlatforms
        ? await cfg.resolveNapiPlatforms(
            `${provisional.repositoryOwner}/${provisional.repositoryName}`,
          )
        : undefined
      const desired = napiPlatforms?.length
        ? (desiredTrustedPublisher({
            current,
            environmentOverride: cfg.environmentOverride,
            napiPlatforms,
            pkg,
            repoOverride: cfg.repoOverride,
            workflowOverride: cfg.workflowOverride,
          }) ?? provisional)
        : provisional
      const repository = `${desired.repositoryOwner}/${desired.repositoryName}`
      const canonical = bindings.filter(
        binding =>
          bindingMatchesRepository(binding, repository) &&
          verifySavedState({ desired, reread: binding }).ok,
      )
      const stale = bindings.filter(
        binding =>
          bindingMatchesRepository(binding, repository) &&
          binding.workflowFilename !== undefined &&
          !canonical.includes(binding) &&
          (binding.workflowFilename === desired.workflowFilename ||
            (LEGACY_WORKFLOW_FILENAMES.includes(binding.workflowFilename) &&
              (binding.workflowFilename === 'npm-publish.yml' ||
                !Object.hasOwn(
                  PUBLISH_FIRST.workflows,
                  binding.workflowFilename,
                ) ||
                PUBLISH_FIRST.workflows[binding.workflowFilename] ===
                  desired.workflowFilename))),
      )
      if (
        canonical.length > 1 ||
        stale.length > 1 ||
        bindings.length !== canonical.length + stale.length
      ) {
        return {
          __proto__: null,
          detail:
            'trusted-publisher rows were ambiguous; no row was changed or deleted',
          pkg,
          status: 'failed',
        }
      }
      const edits = diffTrustedPublisher({ current: canonical[0], desired })
      if (stale.length) {
        edits.push({
          field: 'trustedPublisher',
          from: stale[0]!.workflowFilename ?? '(unknown)',
          to: 'removed',
        })
      }
      if (edits.length === 0) {
        logger.substep(`${pkg}: conforms — no edits`)
        return { __proto__: null, pkg, status: 'conforms' }
      }
      if (!cfg.drive) {
        logger.log(`[dry-run] ${renderPlannedEdits(pkg, edits)}`)
        return { __proto__: null, pkg, status: 'planned' }
      }
      const mutationInput = {
        desired: {
          allowNpmPublish: desired.allowNpmPublish,
          environmentName: desired.environmentName,
          repositoryName: desired.repositoryName,
          repositoryOwner: desired.repositoryOwner,
          workflowFilename: desired.workflowFilename,
        },
        packageName: pkg,
        previous: trustedPublisherBridgeBinding(stale[0]),
      }
      let saved = await task.action(
        'npm.trusted-publisher.apply',
        mutationInput,
      )
      for (
        let challengePhase = 0;
        saved['state'] === 'challenge' && challengePhase < 2;
        challengePhase += 1
      ) {
        const outcome = await task.help(
          `Complete npm human verification for ${pkg}, then choose Completed.`,
        )
        if (outcome !== 'completed') {
          return {
            __proto__: null,
            detail: `npm trusted-publisher challenge ${outcome}`,
            pkg,
            status: 'failed',
          }
        }
        const rawReread = await task.action('npm.trusted-publisher.read', {
          packageName: pkg,
        })
        if (rawReread['state'] === 'reconcile-required') {
          saved = await task.action(
            'npm.trusted-publisher.apply',
            mutationInput,
          )
          continue
        }
        const reread = parseTrustedPublisherBridgeResult(rawReread)
        const verification = verifySavedState({
          desired,
          reread: reread.current,
        })
        if (!verification.ok) {
          return {
            __proto__: null,
            detail: formatPartialSaveFailure({
              mismatches: verification.mismatches,
              url: accessUrl(pkg),
            }),
            pkg,
            status: 'failed',
          }
        }
        saved = { __proto__: null, state: 'verified', verified: true }
      }
      if (saved['verified'] !== true) {
        return {
          __proto__: null,
          detail:
            'npm returned an unknown save result. No automatic mutation retry was attempted. ' +
            `Fix: inspect ${accessUrl(pkg)} before retrying.`,
          pkg,
          status: 'failed',
        }
      }
      logger.success(
        `${pkg}: applied + verified (${desired.repositoryOwner}/${desired.repositoryName} · ${desired.workflowFilename} · ${desired.environmentName}).`,
      )
      return { __proto__: null, pkg, status: 'applied' }
    })
  } catch (e) {
    return {
      __proto__: null,
      detail: errorMessage(e),
      pkg,
      status: 'failed',
    } as ApplyResult
  }
}

export async function expandSocketRegistryWorklist(): Promise<string[]> {
  const names = await readSocketRegistryWorklist()
  logger.log(
    `--socket-registry expanded to ${names.length} immutable, remotely owned @socketregistry package(s).`,
  )
  return names
}

export async function main(): Promise<void> {
  const args = parseTrustedPublisherArgs(getScriptArgs())
  const packages = [...args.packages]
  if (args.socketRegistry) {
    packages.push(...(await expandSocketRegistryWorklist()))
  }
  if (packages.length === 0) {
    logger.fail('No packages named.')
    logger.error(TRUSTED_PUBLISHER_USAGE)
    process.exitCode = 1
    return
  }
  if (args.mode === 'read') {
    const rows: AccessReadRow[] = []
    for (let i = 0, { length } = packages; i < length; i += 1) {
      const pkg = packages[i]!
      try {
        // Serial per-package reads share one page session.
        // eslint-disable-next-line no-await-in-loop -- serial per-package
        const { current, state } = await withTrustedPublisherTask(
          pkg,
          async task => await readTrustedPublisher(task, pkg),
        )
        rows.push({ current, pkg, state })
      } catch (e) {
        rows.push({ detail: errorMessage(e), pkg, state: 'error' })
        process.exitCode = 1
      }
    }
    logger.log(renderReadTable(rows))
    return
  }
  logger.log(
    `npm trusted publishing — ${packages.length} package(s)` +
      `${args.drive ? ' [drive]' : ' [dry-run]'}`,
  )
  const napiPlatformsCache = new Map<string, Promise<readonly string[]>>()
  const resolveNapiPlatforms = (repository: string) => {
    let pending = napiPlatformsCache.get(repository)
    if (!pending) {
      pending = readPublisherNapiPlatforms(repository)
      napiPlatformsCache.set(repository, pending)
    }
    return pending
  }
  const results: ApplyResult[] = []
  for (let i = 0, { length } = packages; i < length; i += 1) {
    // Serial per-package applies share one page session.
    // eslint-disable-next-line no-await-in-loop -- serial per-package applies
    const result = await applyOne(packages[i]!, {
      drive: args.drive,
      environmentOverride: args.environment,
      repoOverride: args.repo,
      resolveNapiPlatforms,
      workflowOverride: args.workflow,
    })
    if (result.status === 'failed' || result.status === 'skipped') {
      logger.error(`${result.pkg}: ${result.status} — ${result.detail}`)
    }
    results.push(result)
  }
  logger.log('')
  logger.log(formatApplySummary(results, { drive: args.drive }))
  if (results.some(r => r.status === 'failed')) {
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'reads and mass-applies the canonical npm trusted-publisher config by driving the access page in a signed-in browser',
  help: `${TRUSTED_PUBLISHER_USAGE}

  --socket-registry   expand to immutable, remotely owned @socketregistry packages
  --drive             fill and save the form (apply is dry-run by default)
  --repo <owner/name> override the repository the config binds to
  --workflow <file>   override the verified workflow filename
  --environment <id> override the verified GitHub environment`,
  json: 'result',
}

// Entrypoint-guarded: importing this module (unit tests of its exported
// helpers) must not launch a browser.
if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
