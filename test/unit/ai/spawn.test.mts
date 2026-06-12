import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  cachePathFor,
  resetAiAgentDiscoveryCache,
} from '../../../src/ai/discover.mts'
import {
  backoffFor,
  buildArgs,
  isOverloaded,
  pickAgent,
} from '../../../src/ai/spawn.mts'

import type { SpawnAiAgentOptions } from '../../../src/ai/types.mts'

let tmpRoot: string

beforeEach(() => {
  resetAiAgentDiscoveryCache()
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-spawn-test-'))
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
  resetAiAgentDiscoveryCache()
})

function primeCache(agents: Record<string, string>): void {
  const cachePath = cachePathFor(tmpRoot)
  mkdirSync(path.dirname(cachePath), { recursive: true })
  writeFileSync(cachePath, JSON.stringify({ agents, writtenAt: Date.now() }))
}

function baseOpts(
  overrides: Partial<SpawnAiAgentOptions> = {},
): SpawnAiAgentOptions {
  return {
    cwd: '/repo',
    disallow: [],
    permissionMode: 'dontAsk',
    prompt: '',
    tools: [],
    ...overrides,
  }
}

describe.sequential('backoffFor', () => {
  test('exponential backoff: 5s / 15s / 45s', () => {
    expect(backoffFor(1)).toBe(5000)
    expect(backoffFor(2)).toBe(15_000)
    expect(backoffFor(3)).toBe(45_000)
  })

  test('grows past the documented retry cap', () => {
    expect(backoffFor(4)).toBe(135_000)
  })
})

describe.sequential('isOverloaded', () => {
  test('detects "API Error: 529" in stdout', () => {
    expect(isOverloaded('API Error: 529 Overloaded', '')).toBe(true)
  })

  test('detects "Overloaded" in stderr', () => {
    expect(isOverloaded('', 'Server returned: Overloaded')).toBe(true)
  })

  test('detects case-insensitive Overloaded', () => {
    expect(isOverloaded('', 'overloaded')).toBe(true)
    expect(isOverloaded('OVERLOADED', '')).toBe(true)
  })

  test('returns false for unrelated text', () => {
    expect(isOverloaded('all is well', 'nothing to see here')).toBe(false)
  })

  test('returns false on empty strings', () => {
    expect(isOverloaded('', '')).toBe(false)
  })
})

describe.sequential('buildArgs — claude', () => {
  test('includes --print, --no-session-persistence, permission-mode, --add-dir', () => {
    const args = buildArgs('claude', baseOpts())
    expect(args).toContain('--print')
    expect(args).toContain('--no-session-persistence')
    expect(args).toContain('--permission-mode')
    expect(args).toContain('dontAsk')
    expect(args).toContain('--add-dir')
    expect(args).toContain('/repo')
  })

  test('appends extra add-dirs', () => {
    const args = buildArgs(
      'claude',
      baseOpts({ addDirs: ['/extra1', '/extra2'] }),
    )
    expect(args.filter(a => a === '--add-dir')).toHaveLength(3)
    expect(args).toContain('/extra1')
    expect(args).toContain('/extra2')
  })

  test('appends --model when provided', () => {
    const args = buildArgs('claude', baseOpts({ model: 'sonnet-4-6' }))
    expect(args).toContain('--model')
    expect(args).toContain('sonnet-4-6')
  })

  test('appends --effort when provided', () => {
    const args = buildArgs('claude', baseOpts({ effort: 'low' }))
    const i = args.indexOf('--effort')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(args[i + 1]).toBe('low')
  })

  test('omits --effort when absent', () => {
    const args = buildArgs('claude', baseOpts())
    expect(args).not.toContain('--effort')
  })

  test('omits --effort for fable (adaptive-thinking-only)', () => {
    const args = buildArgs(
      'claude',
      baseOpts({ effort: 'xhigh', model: 'claude-fable-5' }),
    )
    expect(args).not.toContain('--effort')
    expect(args).toContain('claude-fable-5')
  })

  test('omits --effort for mythos (adaptive-thinking-only)', () => {
    const args = buildArgs(
      'claude',
      baseOpts({ effort: 'max', model: 'claude-mythos-5' }),
    )
    expect(args).not.toContain('--effort')
  })

  test('still appends --effort for a non-fable model', () => {
    const args = buildArgs(
      'claude',
      baseOpts({ effort: 'high', model: 'claude-opus-4-8' }),
    )
    const i = args.indexOf('--effort')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(args[i + 1]).toBe('high')
  })

  test('appends --allowedTools when tools or allow set', () => {
    const args = buildArgs(
      'claude',
      baseOpts({ tools: ['Read'], allow: ['Bash(ls:*)'] }),
    )
    expect(args).toContain('--allowedTools')
    expect(args).toContain('Read')
    expect(args).toContain('Bash(ls:*)')
  })

  test('appends --disallowedTools when disallow set', () => {
    const args = buildArgs('claude', baseOpts({ disallow: ['Write', 'Edit'] }))
    expect(args).toContain('--disallowedTools')
    expect(args).toContain('Write')
    expect(args).toContain('Edit')
  })

  test('omits tool flags when empty', () => {
    const args = buildArgs('claude', baseOpts())
    expect(args).not.toContain('--allowedTools')
    expect(args).not.toContain('--disallowedTools')
  })

  test('appends extraArgs verbatim', () => {
    const args = buildArgs(
      'claude',
      baseOpts({ extraArgs: ['--custom', 'value'] }),
    )
    expect(args).toContain('--custom')
    expect(args).toContain('value')
  })
})

describe.sequential('buildArgs — codex', () => {
  test('always includes --print and --cwd', () => {
    const args = buildArgs('codex', baseOpts())
    expect(args[0]).toBe('--print')
    expect(args).toContain('--cwd')
    expect(args).toContain('/repo')
  })

  test('plan permissionMode maps to --read-only', () => {
    const args = buildArgs('codex', baseOpts({ permissionMode: 'plan' }))
    expect(args).toContain('--read-only')
  })

  test('non-plan permissionMode omits --read-only', () => {
    const args = buildArgs('codex', baseOpts({ permissionMode: 'dontAsk' }))
    expect(args).not.toContain('--read-only')
  })

  test('joins tools with comma', () => {
    const args = buildArgs(
      'codex',
      baseOpts({ tools: ['Read', 'Grep'], allow: ['Bash'] }),
    )
    const toolsIdx = args.indexOf('--tools')
    expect(toolsIdx).toBeGreaterThanOrEqual(0)
    expect(args[toolsIdx + 1]).toBe('Read,Grep,Bash')
  })

  test('joins disallow with comma', () => {
    const args = buildArgs('codex', baseOpts({ disallow: ['Write', 'Edit'] }))
    const idx = args.indexOf('--disallow-tools')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('Write,Edit')
  })

  test('appends --model when provided', () => {
    const args = buildArgs('codex', baseOpts({ model: 'gpt-5' }))
    expect(args).toContain('--model')
    expect(args).toContain('gpt-5')
  })

  test('maps effort to a -c model_reasoning_effort override', () => {
    const args = buildArgs('codex', baseOpts({ effort: 'high' }))
    const i = args.indexOf('-c')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(args[i + 1]).toBe('model_reasoning_effort=high')
  })

  test('clamps the claude-only `max` effort down to codex xhigh', () => {
    const args = buildArgs('codex', baseOpts({ effort: 'max' }))
    const i = args.indexOf('-c')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(args[i + 1]).toBe('model_reasoning_effort=xhigh')
  })

  test('omits the effort override when absent', () => {
    const args = buildArgs('codex', baseOpts())
    expect(args).not.toContain('-c')
  })

  test('appends extraArgs', () => {
    const args = buildArgs('codex', baseOpts({ extraArgs: ['--xx'] }))
    expect(args).toContain('--xx')
  })
})

describe.sequential('buildArgs — gemini', () => {
  test('always includes --no-interactive and --workspace', () => {
    const args = buildArgs('gemini', baseOpts())
    expect(args).toContain('--no-interactive')
    expect(args).toContain('--workspace')
    expect(args).toContain('/repo')
  })

  test('joins allowed-tools with comma', () => {
    const args = buildArgs('gemini', baseOpts({ tools: ['Read', 'Grep'] }))
    const idx = args.indexOf('--allowed-tools')
    expect(args[idx + 1]).toBe('Read,Grep')
  })

  test('joins denied-tools with comma', () => {
    const args = buildArgs('gemini', baseOpts({ disallow: ['Write'] }))
    const idx = args.indexOf('--denied-tools')
    expect(args[idx + 1]).toBe('Write')
  })

  test('plan permissionMode maps to --read-only', () => {
    const args = buildArgs('gemini', baseOpts({ permissionMode: 'plan' }))
    expect(args).toContain('--read-only')
  })

  test('appends --model when provided', () => {
    const args = buildArgs('gemini', baseOpts({ model: 'gemini-2.5-pro' }))
    expect(args).toContain('--model')
  })

  test('appends extraArgs', () => {
    const args = buildArgs('gemini', baseOpts({ extraArgs: ['--xx'] }))
    expect(args).toContain('--xx')
  })
})

describe.sequential('buildArgs — opencode', () => {
  test('always includes --print and --cwd', () => {
    const args = buildArgs('opencode', baseOpts())
    expect(args).toContain('--print')
    expect(args).toContain('--cwd')
    expect(args).toContain('/repo')
  })

  test('joins tools with comma', () => {
    const args = buildArgs('opencode', baseOpts({ tools: ['Read', 'Grep'] }))
    const idx = args.indexOf('--tools')
    expect(args[idx + 1]).toBe('Read,Grep')
  })

  test('joins disallow with comma', () => {
    const args = buildArgs('opencode', baseOpts({ disallow: ['Write'] }))
    const idx = args.indexOf('--no-tools')
    expect(args[idx + 1]).toBe('Write')
  })

  test('appends --model when provided', () => {
    const args = buildArgs('opencode', baseOpts({ model: 'kimi-k2' }))
    expect(args).toContain('--model')
  })

  test('appends extraArgs', () => {
    const args = buildArgs('opencode', baseOpts({ extraArgs: ['--xx'] }))
    expect(args).toContain('--xx')
  })
})

describe.sequential('pickAgent', () => {
  test('returns the requested agent when it is discovered', async () => {
    primeCache({ claude: '/bin/claude', codex: '/bin/codex' })
    expect(await pickAgent('codex', tmpRoot)).toBe('codex')
  })

  test('throws when the requested agent is not discovered', async () => {
    primeCache({ claude: '/bin/claude' })
    await expect(pickAgent('gemini', tmpRoot)).rejects.toThrow(
      /requested agent "gemini" is not on PATH/,
    )
  })

  test('throws with discovered-list in the message when requested agent missing', async () => {
    primeCache({ claude: '/bin/claude', codex: '/bin/codex' })
    await expect(pickAgent('gemini', tmpRoot)).rejects.toThrow(
      /Discovered: claude, codex/,
    )
  })

  test('throws with "(none)" when requested agent missing and no agents discovered', async () => {
    primeCache({})
    await expect(pickAgent('claude', tmpRoot)).rejects.toThrow(
      /Discovered: \(none\)/,
    )
  })

  test('defaults to claude when present and no agent requested', async () => {
    primeCache({ claude: '/bin/claude', codex: '/bin/codex' })
    expect(await pickAgent(undefined, tmpRoot)).toBe('claude')
  })

  test('falls back to codex over opencode/gemini', async () => {
    primeCache({ codex: '/bin/codex', opencode: '/bin/oc', gemini: '/bin/g' })
    expect(await pickAgent(undefined, tmpRoot)).toBe('codex')
  })

  test('falls back to opencode when codex/claude missing', async () => {
    primeCache({ opencode: '/bin/oc', gemini: '/bin/g' })
    expect(await pickAgent(undefined, tmpRoot)).toBe('opencode')
  })

  test('falls back to gemini when only gemini available', async () => {
    primeCache({ gemini: '/bin/g' })
    expect(await pickAgent(undefined, tmpRoot)).toBe('gemini')
  })

  test('throws when no agents discovered and none requested', async () => {
    primeCache({})
    await expect(pickAgent(undefined, tmpRoot)).rejects.toThrow(
      /no AI agent CLI on PATH/,
    )
  })
})
