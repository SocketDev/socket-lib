import assert from 'node:assert/strict'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { test } from 'vitest'

import { runFleetTestScript } from '../../../../scripts/repo/test/run-lane.mts'

test('runFleetTestScript targets the fleet runner from the repo root', () => {
  let command: string | undefined
  let args: string[] | undefined
  const status = runFleetTestScript(
    'test-runner/run-vitest.mts',
    ['run', '--config', '.config/repo/vitest.config.isolated.mts'],
    {
      execute: (receivedCommand, receivedArgs) => {
        command = receivedCommand
        args = receivedArgs
        return 0
      },
    },
  )

  assert.equal(command, process.execPath)
  assert.deepEqual(args, [
    fileURLToPath(
      new URL(
        '../../../../scripts/fleet/test-runner/run-vitest.mts',
        import.meta.url,
      ),
    ),
    'run',
    '--config',
    '.config/repo/vitest.config.isolated.mts',
  ])
  assert.equal(status, 0)
})

test('runFleetTestScript reports a missing child status as failure', () => {
  assert.equal(
    runFleetTestScript('test-runner/run-vitest.mts', [], {
      execute: () => null,
    }),
    1,
  )
})
