#!/usr/bin/env node
/**
 * @file Run the prim CLI with shared argument and error handling.
 */

import process from 'node:process'

import { isMainModule } from '../../../src/cli/is-main-module.mjs'
import { runMain } from '../../../src/cli/main.mjs'
import type { ScriptMeta } from '../../../src/cli/main.mjs'
import { runCli } from '../src/cli.mts'
import { HELP } from '../src/describe.mts'

const SCRIPT_META: ScriptMeta = {
  describe: 'audits and migrates JavaScript built-in usage to primordials',
  help: HELP,
}

async function main(): Promise<void> {
  await runCli(process.argv.slice(2))
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
