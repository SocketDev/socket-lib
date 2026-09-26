import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

export interface RunFleetTestScriptOptions {
  execute?: ((command: string, args: string[]) => number | null) | undefined
}

export function runFleetTestScript(
  script: 'test-runner/run-vitest.mts',
  args: readonly string[],
  options?: RunFleetTestScriptOptions | undefined,
): number {
  const { execute = executeNode } = { __proto__: null, ...options } as Pick<
    RunFleetTestScriptOptions,
    'execute'
  >
  const scriptPath = fileURLToPath(
    new URL(`../../fleet/${script}`, import.meta.url),
  )
  return execute(process.execPath, [scriptPath, ...args]) ?? 1
}

function executeNode(command: string, args: string[]): number | null {
  return spawnSync(command, args, { stdio: 'inherit' }).status
}
