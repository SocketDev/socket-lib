import { describe, expect, it } from 'vitest'

import {
  backendForTask,
  REASONING_HEAVY_TASKS,
} from '../../../src/ai/routing.mts'

describe('backendForTask', () => {
  it('routes a reasoning-heavy task to the heavy backend', () => {
    expect(backendForTask('code-repair')).toBe('llama-server')
  })

  it('routes a reasoning-heavy variant to the heavy backend', () => {
    expect(backendForTask('code-repair-lint-errors')).toBe('llama-server')
  })

  it('keeps a normal task on the built-in backend', () => {
    expect(backendForTask('code-review')).toBe('chrome-builtin')
  })

  it('honors the heavyBackend override', () => {
    expect(backendForTask('code-repair', { heavyBackend: 'openai' })).toBe(
      'openai',
    )
  })

  it('keeps the built-in default for unknown tasks', () => {
    expect(backendForTask('unknown-task')).toBe('chrome-builtin')
  })

  it('covers every registered reasoning-heavy task', () => {
    for (const task of REASONING_HEAVY_TASKS) {
      expect(backendForTask(task)).toBe('llama-server')
    }
  })
})
