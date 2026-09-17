/**
 * @file Shared implementation for the fixed `npm publish`, staged, and approve
 *   entrypoints.
 */
import process from 'node:process'
import { parseArgs } from 'node:util'
import { getScriptArgs, getScriptLogger } from '../process/script-output.mts'
import { assertGhAuth, GH_LOGIN_FIX } from '../registry-infra/gh-auth.mts'
import {
  PUBLISH_GH_SCOPES,
  withGhScopes,
} from '../registry-infra/gh-scope-lease.mts'
import { runWorkflowDispatch } from '../registry-infra/remote-dispatch.mts'
import { isAlreadyPublished } from '../registry-infra/npm/registry.mts'
import { listStagedPackages } from '../registry-infra/npm/shared.mts'
import { workspacePublishableNames } from '../registry-infra/npm/workspace.mts'
import { runApproveStep } from '../release/pipeline/release-runners/promote.mts'
import { REPO_ROOT } from '../paths.mts'
import type { WorkflowDispatchSpec } from '../registry-infra/remote-dispatch.mts'

const logger = getScriptLogger()

export async function withPublishGhScope<T>(
  cli: { dryRun: boolean },
  body: () => Promise<T>,
): Promise<T> {
  if (cli.dryRun) {
    logger.log(
      '--dry-run: nothing is dispatched, so no gh scope is borrowed for this run.',
    )
    return await body()
  }
  return await withGhScopes(
    { flow: 'npm:publish', scopes: PUBLISH_GH_SCOPES },
    body,
  )
}

export function buildPublishDispatch(distTag: string): WorkflowDispatchSpec {
  return {
    workflow: 'publish-npm.yml',
    inputs: { publish: 'true', 'dist-tag': distTag },
  }
}

export async function runPublishStatus(): Promise<void> {
  const localNames = workspacePublishableNames(REPO_ROOT)
  const staged = await listStagedPackages()
  const localStages = staged.filter(entry =>
    entry.name ? localNames.has(entry.name) : false,
  )
  const published = await Promise.all(
    localStages.map(async entry => {
      if (!entry.name || !entry.version || !entry.stageId) {
        throw new Error(
          'Cannot list eligible staged packages. Where: npm:staged. Saw an incomplete stage identity; wanted package, version, and stage ID. Fix: inspect npm staging and retry.',
        )
      }
      return await isAlreadyPublished(entry.name, entry.version)
    }),
  )
  const eligible = localStages
    .filter((_entry, index) => !published[index])
    .toSorted((left, right) =>
      `${left.name}@${left.version}`.localeCompare(
        `${right.name}@${right.version}`,
      ),
    )
  if (eligible.length === 0) {
    logger.log('No eligible staged packages for this repository.')
    return
  }
  logger.log('Eligible staged packages:')
  for (let i = 0, { length } = eligible; i < length; i += 1) {
    const entry = eligible[i]!
    logger.log(`  ${entry.name}@${entry.version} (id: ${entry.stageId})`)
  }
}

export async function runNpmApprove(): Promise<void> {
  const { values } = parseArgs({
    args: getScriptArgs(),
    options: {
      'dry-run': { default: false, type: 'boolean' },
      yes: { default: false, type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  })
  const outcome = await runApproveStep({
    cwd: REPO_ROOT,
    dryRun: values['dry-run'],
    yes: values.yes,
    verifyLocalVersion: false,
  })
  logger.log(outcome.detail)
  if (outcome.status === 'blocked' || outcome.status === 'failed') {
    process.exitCode = 1
  }
}

export async function runNpmPublish(): Promise<void> {
  const { values } = parseArgs({
    args: getScriptArgs(),
    options: {
      'dry-run': { default: false, type: 'boolean' },
      tag: { default: 'latest', type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  })
  const dryRun = values['dry-run']
  if (!dryRun) {
    assertGhAuth({ fix: GH_LOGIN_FIX, flow: 'npm:publish' })
  }
  await withPublishGhScope({ dryRun }, async () => {
    process.exitCode = await runWorkflowDispatch(
      buildPublishDispatch(values.tag),
      { dryRun },
    )
  })
}

export async function runNpmStaged(): Promise<void> {
  parseArgs({
    args: getScriptArgs(),
    options: {},
    allowPositionals: false,
    strict: true,
  })
  await runPublishStatus()
}
