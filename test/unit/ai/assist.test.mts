/**
 * @file Tests for ai/assist — the opt-in "AI assist when stuck" layer. Covers
 *   the env opt-in gate (isAiAssistEnabled), the prompt composer
 *   (buildAssistPrompt), aiAssist's backend-resolution + result mapping, and
 *   assistWhenStuck's no-op-unless-opted-in contract + never-throws behavior.
 *   spawn.mts (pickAgent / spawnAiAgent) is mocked so no real agent CLI runs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AI_ASSIST_ENV,
  aiAssist,
  assistWhenStuck,
  buildAssistPrompt,
  isAiAssistEnabled,
} from '../../../src/ai/assist.mts'

const pickAgent = vi.fn()
const spawnAiAgent = vi.fn()

vi.mock(import('../../../src/ai/spawn.mts'), () => ({
  pickAgent: (...args: unknown[]) => pickAgent(...args),
  spawnAiAgent: (...args: unknown[]) => spawnAiAgent(...args),
}))

function okResult() {
  return {
    attempts: 1,
    durationMs: 1,
    exitCode: 0,
    overloaded: false,
    stderr: '',
    stdout: 'assistant output',
    unavailable: false,
  }
}

beforeEach(() => {
  pickAgent.mockReset()
  spawnAiAgent.mockReset()
})

describe('isAiAssistEnabled', () => {
  it('is off by default (flag absent)', () => {
    expect(isAiAssistEnabled({})).toBe(false)
  })
  it('is on for "1" and "true"', () => {
    expect(isAiAssistEnabled({ [AI_ASSIST_ENV]: '1' })).toBe(true)
    expect(isAiAssistEnabled({ [AI_ASSIST_ENV]: 'true' })).toBe(true)
  })
  it('is off for any other value', () => {
    expect(isAiAssistEnabled({ [AI_ASSIST_ENV]: 'yes' })).toBe(false)
    expect(isAiAssistEnabled({ [AI_ASSIST_ENV]: '0' })).toBe(false)
  })
})

describe('buildAssistPrompt', () => {
  it('emits just the task when there is no context', () => {
    expect(buildAssistPrompt('  do the thing  ')).toBe('do the thing\n')
  })
  it('appends a trimmed context block', () => {
    expect(buildAssistPrompt('fix it', '  the error  ')).toBe(
      'fix it\n\n--- Context ---\nthe error\n',
    )
  })
  it('ignores whitespace-only context', () => {
    expect(buildAssistPrompt('fix it', '   ')).toBe('fix it\n')
  })
})

describe('aiAssist', () => {
  it('resolves a backend, runs it, and maps a clean exit to ok', async () => {
    pickAgent.mockResolvedValue('claude')
    spawnAiAgent.mockResolvedValue(okResult())
    const r = await aiAssist({ task: 'help', cwd: '/repo' })
    expect(r).toEqual({
      backend: 'claude',
      error: undefined,
      ok: true,
      output: 'assistant output',
    })
    expect(pickAgent).toHaveBeenCalledWith(undefined, '/repo')
    // The prompt was composed + passed through.
    expect(spawnAiAgent.mock.calls[0]![0]).toMatchObject({
      agent: 'claude',
      cwd: '/repo',
      prompt: 'help\n',
    })
  })
  it('honors an explicit backend', async () => {
    pickAgent.mockResolvedValue('codex')
    spawnAiAgent.mockResolvedValue(okResult())
    const r = await aiAssist({ backend: 'codex', task: 'x', cwd: '/r' })
    expect(pickAgent).toHaveBeenCalledWith('codex', '/r')
    expect(r.backend).toBe('codex')
  })
  it('maps a non-zero exit / unavailable model to not-ok with an error', async () => {
    pickAgent.mockResolvedValue('claude')
    spawnAiAgent.mockResolvedValue({
      ...okResult(),
      exitCode: 1,
      stderr: 'boom',
    })
    const r = await aiAssist({ task: 'x', cwd: '/r' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })
  it('falls back to "exit N" when stderr is empty on a non-zero exit', async () => {
    pickAgent.mockResolvedValue('claude')
    spawnAiAgent.mockResolvedValue({ ...okResult(), exitCode: 2, stderr: '' })
    const r = await aiAssist({ task: 'x', cwd: '/r' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('exit 2')
  })
  it('treats an unavailable model as not-ok even on exit 0', async () => {
    pickAgent.mockResolvedValue('claude')
    spawnAiAgent.mockResolvedValue({ ...okResult(), unavailable: true })
    const r = await aiAssist({ task: 'x', cwd: '/r' })
    expect(r.ok).toBe(false)
  })
  it('defaults the timeout to DEFAULT_TIMEOUT_MS, else honors an explicit one', async () => {
    pickAgent.mockResolvedValue('claude')
    spawnAiAgent.mockResolvedValue(okResult())
    await aiAssist({ task: 'x', cwd: '/r' })
    expect(spawnAiAgent.mock.calls[0]![0]).toMatchObject({
      timeoutMs: 5 * 60 * 1000,
    })
    await aiAssist({ task: 'x', cwd: '/r', timeoutMs: 123 })
    expect(spawnAiAgent.mock.calls[1]![0]).toMatchObject({ timeoutMs: 123 })
  })
})

describe('assistWhenStuck', () => {
  it('is a no-op (undefined) when not opted in', async () => {
    const r = await assistWhenStuck({ task: 'x', cwd: '/r' })
    expect(r).toBeUndefined()
    expect(pickAgent).not.toHaveBeenCalled()
  })
  it('runs when optIn:true even without the env flag', async () => {
    pickAgent.mockResolvedValue('claude')
    spawnAiAgent.mockResolvedValue(okResult())
    const r = await assistWhenStuck({ optIn: true, task: 'x', cwd: '/r' })
    expect(r?.ok).toBe(true)
    expect(pickAgent).toHaveBeenCalledOnce()
  })
  it('never throws — a no-agent-on-PATH failure collapses to a failed result', async () => {
    pickAgent.mockRejectedValue(new Error('no AI agent CLI on PATH'))
    const r = await assistWhenStuck({ optIn: true, task: 'x', cwd: '/r' })
    expect(r).toEqual({
      backend: 'claude',
      error: 'no AI agent CLI on PATH',
      ok: false,
      output: '',
    })
  })
  it('runs via the SOCKET_AI_ASSIST env flag (no optIn arg)', async () => {
    pickAgent.mockResolvedValue('claude')
    spawnAiAgent.mockResolvedValue(okResult())
    const prev = process.env[AI_ASSIST_ENV]
    process.env[AI_ASSIST_ENV] = '1'
    try {
      const r = await assistWhenStuck({ task: 'x', cwd: '/r' })
      expect(r?.ok).toBe(true)
      expect(pickAgent).toHaveBeenCalledOnce()
    } finally {
      if (prev === undefined) {
        delete process.env[AI_ASSIST_ENV]
      } else {
        process.env[AI_ASSIST_ENV] = prev
      }
    }
  })
  it('carries the explicit backend in the failed result on throw', async () => {
    pickAgent.mockRejectedValue(new Error('nope'))
    const r = await assistWhenStuck({
      backend: 'codex',
      cwd: '/r',
      optIn: true,
      task: 'x',
    })
    expect(r).toMatchObject({ backend: 'codex', error: 'nope', ok: false })
  })
})
