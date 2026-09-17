/**
 * @file Dispatch the CI-only staged npm Socket scan.
 */

import process from 'node:process'
import { parseArgs } from 'node:util'

import { isMainModule } from '../process/is-main-module.mts'
import { runMain } from '../process/run-main.mts'
import type { ScriptMeta } from '../process/run-main.mts'
import { getScriptArgs } from '../process/script-output.mts'
import { runWorkflowDispatch } from '../registry-infra/remote-dispatch.mts'
import type { WorkflowDispatchSpec } from '../registry-infra/remote-dispatch.mts'

const SHA_PATTERN = /^[0-9a-f]{40}$/u

export interface NpmScanDispatchArgs {
  packageName: string
  publishRunId: string
  sourceSha: string
  stageId: string
  stageSha1: string
  version: string
}

function requiredString(value: unknown, flag: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required ${flag} value.`)
  }
  return value.trim()
}

export function parseNpmScanArgs(argv: readonly string[]): NpmScanDispatchArgs {
  const { values } = parseArgs({
    allowPositionals: false,
    args: [...argv],
    options: {
      package: { type: 'string' },
      'publish-run-id': { type: 'string' },
      'source-sha': { type: 'string' },
      'stage-id': { type: 'string' },
      'stage-sha1': { type: 'string' },
      version: { type: 'string' },
    },
    strict: true,
  })
  const parsed = {
    packageName: requiredString(values['package'], '--package'),
    publishRunId: requiredString(values['publish-run-id'], '--publish-run-id'),
    sourceSha: requiredString(values['source-sha'], '--source-sha'),
    stageId: requiredString(values['stage-id'], '--stage-id'),
    stageSha1: requiredString(values['stage-sha1'], '--stage-sha1'),
    version: requiredString(values['version'], '--version'),
  }
  if (
    !SHA_PATTERN.test(parsed.sourceSha) ||
    !SHA_PATTERN.test(parsed.stageSha1) ||
    !/^[1-9]\d*$/u.test(parsed.publishRunId) ||
    !/^[0-9a-f-]{36}$/u.test(parsed.stageId) ||
    !/^@?[a-z0-9][a-z0-9._/-]*$/u.test(parsed.packageName) ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(parsed.version)
  ) {
    throw new Error(
      'Invalid npm scan values. Use full 40-hex source/stage digests, a positive publish run ID, and exact package/version values.',
    )
  }
  return parsed
}

export function buildNpmScanSpec(
  args: NpmScanDispatchArgs,
): WorkflowDispatchSpec {
  return {
    inputs: {
      'scan-package': args.packageName,
      'scan-publish-run-id': args.publishRunId,
      'scan-source-sha': args.sourceSha,
      'scan-stage-id': args.stageId,
      'scan-stage-sha1': args.stageSha1,
      'scan-version': args.version,
    },
    workflow: 'publish-npm.yml',
  }
}

export async function main(): Promise<number> {
  const code = await runWorkflowDispatch(
    buildNpmScanSpec(parseNpmScanArgs(getScriptArgs())),
  )
  if (code !== 0) {
    process.exitCode = code
  }
  return code
}

const SCRIPT_META: ScriptMeta = {
  describe: 'dispatches the source-bound CI scan for exact staged npm bytes',
  help: `Usage: pnpm run npm:scan --package <name> --version <version> --stage-id <id> --stage-sha1 <sha1> --source-sha <sha> --publish-run-id <id>`,
  json: 'result',
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
