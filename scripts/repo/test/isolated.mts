import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { runMain } from '../../fleet/process/main/run.mts'
import type { ScriptMeta } from '../../fleet/process/main/run.mts'
import { getScriptArgs } from '../../fleet/process/script-output.mts'
import { runFleetTestScript } from './run-lane.mts'

const SCRIPT_META: ScriptMeta = {
  describe: 'run isolated tests with the repo-specific Vitest configuration',
  help: 'Usage: pnpm run test:isolated [Vitest options]',
  json: 'result',
}

export type IsolatedTestOptions = {
  args?: string[] | undefined
  configPath?: string | undefined
  run?: typeof runFleetTestScript | undefined
}

export function runIsolatedTestScript(
  options: IsolatedTestOptions = {},
): number {
  const configPath =
    options.configPath ??
    fileURLToPath(
      new URL(
        '../../../.config/repo/vitest.config.isolated.mts',
        import.meta.url,
      ),
    )
  if (!existsSync(configPath)) {
    throw new Error(
      `Isolated Vitest configuration is missing. Where: ${configPath}. Saw: no file; wanted the repo-owned isolated config. Fix: add .config/repo/vitest.config.isolated.mts.`,
    )
  }
  const run = options.run ?? runFleetTestScript
  return run('test-runner/run-vitest.mts', [
    'run',
    '--config',
    configPath,
    ...(options.args ?? getScriptArgs()),
  ])
}

function main(): number {
  return runIsolatedTestScript()
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
