import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { test } from 'vitest'

import { runIsolatedTestScript } from '../../../../scripts/repo/test/isolated.mts'

test('runIsolatedTestScript invokes the fleet runner with the repo config', () => {
  const configPath = fileURLToPath(
    new URL(
      '../../../../.config/repo/vitest.config.isolated.mts',
      import.meta.url,
    ),
  )
  let command: string | undefined
  let args: readonly string[] | undefined
  const status = runIsolatedTestScript({
    args: ['--testNamePattern', 'isolated'],
    configPath,
    run: (receivedCommand, receivedArgs) => {
      command = receivedCommand
      args = receivedArgs
      return 0
    },
  })

  assert.equal(command, 'test-runner/run-vitest.mts')
  assert.deepEqual(args, [
    'run',
    '--config',
    configPath,
    '--testNamePattern',
    'isolated',
  ])
  assert.equal(status, 0)
})

test('runIsolatedTestScript rejects a missing repo config', () => {
  assert.throws(
    () =>
      runIsolatedTestScript({
        configPath: '/missing/vitest.config.isolated.mts',
      }),
    /Isolated Vitest configuration is missing/,
  )
})
