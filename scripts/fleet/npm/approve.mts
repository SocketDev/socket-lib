import { isMainModule } from '../process/is-main-module.mts'
import { runNpmApprove } from './util.mts'
import { runMain } from '../process/run-main.mts'
import type { ScriptMeta } from '../process/run-main.mts'

const SCRIPT_META: ScriptMeta = {
  describe: 'approves verified and scanned npm staging',
  help: `Usage: pnpm run npm:approve

  --dry-run preview approval without mutations`,
  json: 'result',
}

if (isMainModule(import.meta.url)) {
  runMain(runNpmApprove, SCRIPT_META)
}
