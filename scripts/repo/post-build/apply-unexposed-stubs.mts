/*
 * @file Post-build CLI for the unexposed-leaf stub pass: swaps each built
 *   dist module named in `scripts/repo/build-stubs/unexposed-leaves.json`
 *   for a throwing stub (see `scripts/repo/build-stubs/unexposed.mts`).
 *   Runs after the CJS-export rewrite so the stub bodies are final, and
 *   before the dist validators so the stubbed export names still gate.
 */

import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { applyUnexposedStubs } from '../build-stubs/unexposed.mts'
import { REPO_ROOT } from '../../fleet/paths.mts'
import { isMainModule } from '../../fleet/_shared/is-main-module.mts'

const logger = getDefaultLogger()

function main(): void {
  const { stubbed } = applyUnexposedStubs(REPO_ROOT)
  if (!isQuiet() && stubbed.length > 0) {
    logger.success(`Stubbed ${stubbed.length} unexposed leaf module(s).`)
  }
}

if (isMainModule(import.meta.url)) {
  main()
}
