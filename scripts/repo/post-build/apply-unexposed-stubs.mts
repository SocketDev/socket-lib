/*
 * @file Post-build CLI for the unexposed-leaf stub pass: swaps each built
 *   dist module named in `scripts/repo/build-stubs/unexposed-leaves.json`
 *   for a throwing stub (see `scripts/repo/build-stubs/unexposed.mts`).
 *   Runs after the CJS-export rewrite so the stub bodies are final, and
 *   before the dist validators so the stubbed export names still gate.
 */

import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import {
  findStubsReachableFromShippedCode,
  reachableStubErrorMessage,
} from '../build-stubs/dist-graph.mts'
import { applyUnexposedStubs } from '../build-stubs/unexposed.mts'
import { REPO_ROOT } from '../../fleet/paths.mts'
import { isMainModule } from '../../fleet/_shared/is-main-module.mts'
import { runMain } from '../../fleet/_shared/run-main.mts'

import type { ScriptMeta } from '../../fleet/_shared/run-main.mts'

const logger = getDefaultLogger()

function main(): void {
  const { stubbed } = applyUnexposedStubs(REPO_ROOT)
  if (!isQuiet() && stubbed.length > 0) {
    logger.success(`Stubbed ${stubbed.length} unexposed leaf module(s).`)
  }
  // Judge the dist we just produced, not the list that produced it. A stub the
  // shipped graph can still reach is a dead code path in the published build,
  // so the build fails here rather than letting the tarball carry it.
  const reachable = findStubsReachableFromShippedCode(REPO_ROOT)
  if (reachable.length > 0) {
    throw new Error(reachableStubErrorMessage(reachable))
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'swaps each dist module listed in unexposed-leaves.json for a throwing stub',
  help: `Usage: node scripts/repo/post-build/apply-unexposed-stubs.mts [flags]

  --quiet, --silent   suppress the success summary`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
