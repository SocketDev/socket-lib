/**
 * @file Thin test wrapper for Prim's node:test suite. Package scripts defer to
 *   this file so runner selection and file discovery live outside package.json.
 */

import { globSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'

const logger = getDefaultLogger()
const packageRoot = path.resolve(import.meta.dirname, '..')
export async function main(): Promise<void> {
  const testFiles = globSync('test/*.test.mts', { cwd: packageRoot }).toSorted()
  await spawn(process.execPath, ['--test', ...testFiles], {
    cwd: packageRoot,
    stdio: 'inherit',
    stripAnsi: false,
  })
}

main().catch((error: unknown) => {
  logger.error(
    `Prim test runner failed in tools/prim/scripts/test.mts: saw ${errorMessage(error)}; expected node --test to complete. Rerun pnpm --filter prim test after fixing the failing test.`,
  )
  process.exitCode = 1
})
