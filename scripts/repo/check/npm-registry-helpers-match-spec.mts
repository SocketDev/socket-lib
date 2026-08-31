#!/usr/bin/env node
/**
 * @file Repo check — the npm registry helpers in `src/npm/registry/` still
 *   match npm's published OpenAPI spec. Those helpers were hand-written from
 *   the rendered docs at api-docs.npmjs.com, which drifts silently: npm adds an
 *   endpoint or renames a field and nothing in this repo notices. This gate
 *   notices. It compares two inventories. The spec side is
 *   `scripts/repo/npm-api-spec/spec-inventory.generated.json`, the committed
 *   projection of the pinned `npm/api-documentation` commit. The implementation
 *   side is an AST read of every `src/npm/registry/*.mts`, per
 *   socket/no-source-sniffing. Neither side needs the network, so the default
 *   path runs fully offline and a CI box with no egress gets the same verdict
 *   as a laptop. `--online` adds one more question: has npm's `main` moved past
 *   our pin? That read fails open — offline or rate-limited answers "could not
 *   ask", never a failure. Exit: 1 when the spec documents an endpoint no
 *   helper builds, or (with `--strict`) when a spec field appears nowhere in
 *   the owning module. Undocumented helpers and field gaps are reported but do
 *   not fail by default: npm's spec covers less than the registry serves, and
 *   an open `Record` is a legitimate way to carry a growing child shape. Usage:
 *   node scripts/repo/check/npm-registry-helpers-match-spec.mts [--json]
 *   [--online] [--strict]
 */

import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { isJsonRequested, runMain } from '../../fleet/process/run-main.mts'
import { reportDrift } from '../npm-api-spec/drift.mts'
import {
  readHelperModules,
  readSpecInventory,
} from '../npm-api-spec/inventory.mts'
import { readSpecPin } from '../npm-api-spec/pin.mts'
import { renderDriftLines } from '../npm-api-spec/render.mts'
import { resolveSpecHead } from '../npm-api-spec/spec-fetch.mts'

import type { ScriptMeta } from '../../fleet/process/run-main.mts'
import type { SpecCheckResult } from '../npm-api-spec/render.mts'

const logger = getDefaultLogger()

/**
 * How a check run is allowed to reach the world, and how harshly it judges.
 */
export interface SpecCheckOptions {
  /**
   * True to also ask GitHub whether npm's `main` has moved past the pin. Fails
   * open: unreachable answers "could not ask", never a failure.
   */
  online?: boolean | undefined
  /**
   * True to treat a field gap as a failure, not advice.
   */
  strict?: boolean | undefined
}

/**
 * Run every offline leg, plus the online staleness leg when asked.
 */
export async function checkHelpersMatchSpec(
  options?: SpecCheckOptions | undefined,
): Promise<SpecCheckResult> {
  const opts = { __proto__: null, ...options } as SpecCheckOptions
  const inventory = readSpecInventory()
  const pin = readSpecPin()
  if (!inventory) {
    return {
      drift: undefined,
      headSha: undefined,
      pinIsStale: undefined,
      pinnedSha: pin?.sha,
      ready: false,
      specEndpoints: 0,
    }
  }
  const drift = reportDrift(inventory, readHelperModules())
  let headSha: string | undefined
  let pinIsStale: boolean | undefined
  if (opts.online === true) {
    headSha = await resolveSpecHead()
    pinIsStale = headSha === undefined ? undefined : headSha !== inventory.sha
  }
  return {
    drift,
    headSha,
    pinIsStale,
    pinnedSha: inventory.sha,
    ready: true,
    specEndpoints: inventory.endpoints.length,
  }
}

/**
 * True when the run should exit non-zero. An uncovered endpoint always fails;
 * a field gap only fails under `--strict`.
 */
export function isFailing(
  result: SpecCheckResult,
  options?: SpecCheckOptions | undefined,
): boolean {
  const opts = { __proto__: null, ...options } as SpecCheckOptions
  if (!result.drift) {
    return false
  }
  if (result.drift.uncovered.length > 0) {
    return true
  }
  return opts.strict === true && result.drift.missingFields.length > 0
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const online = argv.includes('--online')
  const strict = argv.includes('--strict')
  const result = await checkHelpersMatchSpec({ online, strict })

  if (isJsonRequested(argv)) {
    logger.log(JSON.stringify(result, undefined, 2))
  } else {
    const lines = renderDriftLines(result, { strict })
    for (let i = 0, { length } = lines; i < length; i += 1) {
      logger.log(lines[i]!)
    }
  }

  if (isFailing(result, { strict })) {
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    "checks the src/npm/registry helpers still match npm's published OpenAPI spec",
  help: `Usage: node scripts/repo/check/npm-registry-helpers-match-spec.mts [flags]

  --json      print the drift report as JSON instead of prose
  --online    also ask GitHub whether npm's main has moved past our pin
              (fails open: offline answers "could not ask", never red)
  --strict    also fail when a spec field is named nowhere in the owning module

Refresh the pin with \`node scripts/repo/sync-npm-api-spec.mts --refresh\`.`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
