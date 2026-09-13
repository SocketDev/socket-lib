#!/usr/bin/env node
/**
 * @file Run the prim CLI with shared argument and error handling.
 */

import process from 'node:process'

import { isMainModule } from '../../../scripts/fleet/process/is-main-module.mts'
import { runMain } from '../../../scripts/fleet/process/run-main.mts'
import type { ScriptMeta } from '../../../scripts/fleet/process/run-main.mts'
import { runCli } from '../src/cli.mts'
import { HELP } from '../src/describe.mts'

const SCRIPT_META: ScriptMeta = {
  describe: 'audits and migrates JavaScript built-in usage to primordials',
  help: HELP,
  json: 'native',
}

async function main(): Promise<void> {
  await runCli(process.argv.slice(2))
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
