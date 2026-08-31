#!/usr/bin/env node
/**
 * @file Re-pin npm's published OpenAPI source and regenerate the endpoint
 *   inventory the drift check reads.
 *   This is the WRITE half of the pair. The read half,
 *   `scripts/repo/check/npm-registry-helpers-match-spec.mts`, runs in
 *   `pnpm run check --all` and never touches the network on its default path.
 *   Default run verifies: it re-reads the spec at the COMMITTED sha and
 *   confirms the bytes still hash to the recorded digests, which is the
 *   integrity leg of docs/agents.md/fleet/immutable-references.md. `--refresh`
 *   advances the pin to whatever `main` points at now, then rewrites both the
 *   pin and the generated inventory.
 *   Usage:
 *   node scripts/repo/sync-npm-api-spec.mts
 *   node scripts/repo/sync-npm-api-spec.mts --refresh
 *   node scripts/repo/sync-npm-api-spec.mts --refresh --json.
 */

import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { isMainModule } from '../fleet/process/is-main-module.mts'
import { isJsonRequested, runMain } from '../fleet/process/run-main.mts'
import {
  buildSpecInventory,
  formatGeneratedFiles,
  writeSpecInventory,
} from './npm-api-spec/inventory.mts'
import {
  isFullCommitSha,
  readSpecPin,
  refLabelFor,
  SPEC_BRANCH,
  SPEC_INVENTORY_PATH,
  SPEC_PIN_PATH,
  SPEC_REPO,
  writeSpecPin,
} from './npm-api-spec/pin.mts'
import {
  loadSpecAt,
  resolveSpecHead,
  specFileDigests,
  verifyAgainstPin,
} from './npm-api-spec/spec-fetch.mts'

import type { SpecPin } from './npm-api-spec/pin.mts'
import type { ScriptMeta } from '../fleet/process/run-main.mts'

const logger = getDefaultLogger()

const SCRIPT = '[sync-npm-api-spec]'

/**
 * What one run concluded, in the shape `--json` prints.
 */
export interface SyncResult {
  readonly endpoints: number
  readonly mismatched: readonly string[]
  readonly mode: 'refresh' | 'verify'
  readonly reachable: boolean
  readonly sha: string
  readonly wrote: boolean
}

/**
 * Advance the pin to the current branch head and regenerate everything from it.
 */
export async function refreshPin(): Promise<SyncResult> {
  const head = await resolveSpecHead({ refresh: true })
  if (!head || !isFullCommitSha(head)) {
    return {
      endpoints: 0,
      mismatched: [],
      mode: 'refresh',
      reachable: false,
      sha: '',
      wrote: false,
    }
  }
  const spec = await loadSpecAt(head)
  if (!spec) {
    return {
      endpoints: 0,
      mismatched: [],
      mode: 'refresh',
      reachable: false,
      sha: head,
      wrote: false,
    }
  }
  const inventory = buildSpecInventory(spec)
  const pin: SpecPin = {
    files: specFileDigests(spec),
    generatedBy: 'scripts/repo/sync-npm-api-spec.mts --refresh',
    refLabel: refLabelFor(SPEC_BRANCH, new Date()),
    repo: SPEC_REPO,
    sha: head,
  }
  writeSpecPin(pin)
  writeSpecInventory(inventory)
  await formatGeneratedFiles([SPEC_PIN_PATH, SPEC_INVENTORY_PATH])
  return {
    endpoints: inventory.endpoints.length,
    mismatched: [],
    mode: 'refresh',
    reachable: true,
    sha: head,
    wrote: true,
  }
}

/**
 * Re-read the spec at the committed sha and check its bytes against the
 * recorded digests.
 */
export async function verifyPin(): Promise<SyncResult> {
  const pin = readSpecPin()
  if (!pin) {
    return {
      endpoints: 0,
      mismatched: [],
      mode: 'verify',
      reachable: false,
      sha: '',
      wrote: false,
    }
  }
  const spec = await loadSpecAt(pin.sha)
  if (!spec) {
    return {
      endpoints: 0,
      mismatched: [],
      mode: 'verify',
      reachable: false,
      sha: pin.sha,
      wrote: false,
    }
  }
  const inventory = buildSpecInventory(spec)
  return {
    endpoints: inventory.endpoints.length,
    mismatched: verifyAgainstPin(spec, pin.files),
    mode: 'verify',
    reachable: true,
    sha: pin.sha,
    wrote: false,
  }
}

/**
 * Human-readable lines for one result.
 */
export function describeSyncResult(result: SyncResult): string[] {
  if (!result.reachable) {
    return [
      `${SCRIPT} could not read the spec (offline, rate-limited, or no pin yet).`,
      `${SCRIPT} nothing was written.`,
    ]
  }
  const lines = [
    `${SCRIPT} ${result.mode} at ${result.sha}`,
    `${SCRIPT} ${result.endpoints} endpoint(s) in the composed spec.`,
  ]
  if (result.mismatched.length) {
    lines.push(
      `${SCRIPT} INTEGRITY FAILURE — ${result.mismatched.length} file(s) hashed differently at the same sha:`,
    )
    for (let i = 0, { length } = result.mismatched; i < length; i += 1) {
      lines.push(`${SCRIPT}   ${result.mismatched[i]!}`)
    }
  }
  if (result.wrote) {
    lines.push(
      `${SCRIPT} wrote spec-pin.json and spec-inventory.generated.json.`,
    )
  }
  return lines
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const refresh = argv.includes('--refresh')
  const result = refresh ? await refreshPin() : await verifyPin()

  if (isJsonRequested(argv)) {
    logger.log(JSON.stringify(result, undefined, 2))
  } else {
    const lines = describeSyncResult(result)
    for (let i = 0, { length } = lines; i < length; i += 1) {
      logger.log(lines[i]!)
    }
  }

  // An integrity mismatch is the one hard failure: the same sha served
  // different bytes. Unreachable is not — see the fail-open rule in the file
  // header of ./npm-api-spec/spec-fetch.mts.
  if (result.mismatched.length) {
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    "re-pins npm's published OpenAPI spec by commit sha and regenerates the endpoint inventory",
  help: `Usage: node scripts/repo/sync-npm-api-spec.mts [flags]

  --refresh   advance the pin to the current ${SPEC_BRANCH} head and rewrite
              spec-pin.json + spec-inventory.generated.json
  --json      print the result as JSON instead of prose

Without --refresh the script VERIFIES: it re-reads ${SPEC_REPO} at the
committed sha and fails when any file's bytes no longer hash to the recorded
sha256. Both modes fail open when GitHub cannot be reached.`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
