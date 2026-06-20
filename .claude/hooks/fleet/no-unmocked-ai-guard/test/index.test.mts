// Unit tests for no-unmocked-ai-guard. The pure detectors + the hook's invoke
// verdict, exercised by importing the module (runHook no-ops on import).

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { callsUnmockedAi, hook, isTestFilePath } from '../index.mts'

describe('no-unmocked-ai-guard', () => {
  test('isTestFilePath', () => {
    assert.equal(isTestFilePath('pkg/foo.test.mts'), true)
    assert.equal(isTestFilePath('a/test/bar.mts'), true)
    assert.equal(isTestFilePath('src/baz.mts'), false)
  })

  test('callsUnmockedAi', () => {
    assert.equal(callsUnmockedAi('const r = await spawnAiAgent(opts)'), true)
    assert.equal(
      callsUnmockedAi("vi.mock('x')\nawait spawnAiAgent(opts)"),
      false,
    )
    assert.equal(callsUnmockedAi('const x = 1'), false)
  })

  test('blocks a test that spawns AI unmocked', async () => {
    const verdict = await hook.invoke({
      tool_name: 'Write',
      tool_input: {
        file_path: 'x.test.mts',
        content: 'await spawnAiAgent(o)',
      },
    })
    assert.equal(verdict?.kind, 'block')
  })

  test('allows when vi.mock is present', async () => {
    const verdict = await hook.invoke({
      tool_name: 'Write',
      tool_input: {
        file_path: 'x.test.mts',
        content: "vi.mock('ai')\nawait spawnAiAgent(o)",
      },
    })
    assert.equal(verdict, undefined)
  })

  test('allows a non-test file', async () => {
    const verdict = await hook.invoke({
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/x.mts',
        content: 'await spawnAiAgent(o)',
      },
    })
    assert.equal(verdict, undefined)
  })
})
