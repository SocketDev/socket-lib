import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// `describe.sequential` because the source uses module-scoped state
// (`inProcessCache`) and these tests rely on a shared `tmpRoot` cleared
// in beforeEach/afterEach. Concurrent tests would race on the dir +
// the global cache, producing flaky ENOENTs.
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  cachePathFor,
  discoverAiAgents,
  discoverFresh,
  getDiscoveredAiAgents,
  readDiskCache,
  resetAiAgentDiscoveryCache,
  writeDiskCache,
} from '../../../src/ai/discover.mts'

// No vi.mock — these tests exercise the real module against the real fs.
// `discoverFresh` uses `whichSync` from src/bin/which against PATH; on a
// dev / CI machine the four known agent names (claude, codex, gemini,
// opencode) may or may not be present, so we exercise the SHAPE of the
// returned object instead of pinning specific keys. The cache + on-disk
// fns get full coverage via direct invocation with a tmpRoot per test.

let tmpRoot: string

beforeEach(() => {
  resetAiAgentDiscoveryCache()
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-discover-test-'))
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
  resetAiAgentDiscoveryCache()
})

describe.sequential('cachePathFor', () => {
  test('places cache under the node_modules cache dir', () => {
    const result = cachePathFor('/foo')
    expect(path.isAbsolute(result)).toBe(true)
    expect(path.relative('/foo', result).split(path.sep)).toEqual([
      'node_modules',
      '.cache',
      'agent-discovery.json',
    ])
  })
})

describe.sequential('discoverFresh', () => {
  test('returns an object whose values are absolute string paths', () => {
    const out = discoverFresh()
    expect(typeof out).toBe('object')
    expect(out).not.toBeNull()
    const values = Object.values(out)
    for (let i = 0, { length } = values; i < length; i += 1) {
      const value = values[i]!
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  test('only includes known agent names', () => {
    const out = discoverFresh()
    const known = new Set(['claude', 'codex', 'gemini', 'opencode'])
    const keys = Object.keys(out)
    for (let i = 0, { length } = keys; i < length; i += 1) {
      const key = keys[i]!
      expect(known.has(key)).toBe(true)
    }
  })
})

describe.sequential('readDiskCache', () => {
  test('returns undefined when the file does not exist', () => {
    expect(readDiskCache(path.join(tmpRoot, 'missing.json'))).toBeUndefined()
  })

  test('returns undefined on malformed JSON', () => {
    const cachePath = cachePathFor(tmpRoot)
    mkdirSync(path.dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, 'this is not json')
    expect(readDiskCache(cachePath)).toBeUndefined()
  })

  test('returns undefined when writtenAt is missing', () => {
    const cachePath = cachePathFor(tmpRoot)
    mkdirSync(path.dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({ agents: { claude: '/bin/claude' } }),
    )
    expect(readDiskCache(cachePath)).toBeUndefined()
  })

  test('returns undefined when writtenAt is not a number', () => {
    const cachePath = cachePathFor(tmpRoot)
    mkdirSync(path.dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({ agents: {}, writtenAt: 'yesterday' }),
    )
    expect(readDiskCache(cachePath)).toBeUndefined()
  })

  test('returns undefined when writtenAt is past the TTL', () => {
    const cachePath = cachePathFor(tmpRoot)
    mkdirSync(path.dirname(cachePath), { recursive: true })
    const past = Date.now() - (60 * 60 * 1000 + 1)
    writeFileSync(
      cachePath,
      JSON.stringify({ agents: { claude: '/bin/claude' }, writtenAt: past }),
    )
    expect(readDiskCache(cachePath)).toBeUndefined()
  })

  test('returns the agents map for a fresh on-disk cache', () => {
    const cachePath = cachePathFor(tmpRoot)
    mkdirSync(path.dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({
        agents: { claude: '/bin/claude' },
        writtenAt: Date.now(),
      }),
    )
    expect(readDiskCache(cachePath)).toEqual({ claude: '/bin/claude' })
  })
})

describe.sequential('writeDiskCache', () => {
  test('creates the parent dir and writes a JSON file with agents + writtenAt', async () => {
    const cachePath = cachePathFor(tmpRoot)
    await writeDiskCache(cachePath, { claude: '/bin/claude' })
    expect(existsSync(cachePath)).toBe(true)
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as {
      agents: Record<string, string>
      writtenAt: number
    }
    expect(parsed.agents).toEqual({ claude: '/bin/claude' })
    expect(typeof parsed.writtenAt).toBe('number')
  })

  test('does not throw when the write fails (parent is a regular file)', async () => {
    const blocker = path.join(tmpRoot, 'blocker')
    writeFileSync(blocker, 'I am a file')
    const cachePath = path.join(blocker, 'agent-discovery.json')
    await expect(writeDiskCache(cachePath, {})).resolves.toBeUndefined()
    expect(existsSync(cachePath)).toBe(false)
  })

  test('round-trips through readDiskCache', async () => {
    const cachePath = cachePathFor(tmpRoot)
    await writeDiskCache(cachePath, { codex: '/opt/codex' })
    expect(readDiskCache(cachePath)).toEqual({ codex: '/opt/codex' })
  })
})

describe.sequential('getDiscoveredAiAgents', () => {
  test('returns undefined before any discovery', () => {
    expect(getDiscoveredAiAgents()).toBeUndefined()
  })

  test('returns the in-process cache once discoverAiAgents populates it', async () => {
    const fresh = await discoverAiAgents({ repoRoot: tmpRoot })
    expect(getDiscoveredAiAgents()).toBe(fresh)
  })
})

describe.sequential('discoverAiAgents', () => {
  test('populates the in-process cache on first call', async () => {
    const out = await discoverAiAgents({ repoRoot: tmpRoot })
    expect(getDiscoveredAiAgents()).toBe(out)
    expect(typeof out).toBe('object')
  })

  test('returns the same cached object on the second call', async () => {
    const first = await discoverAiAgents({ repoRoot: tmpRoot })
    const second = await discoverAiAgents({ repoRoot: tmpRoot })
    expect(second).toBe(first)
  })

  test('refresh: true returns a fresh (potentially different) object', async () => {
    const first = await discoverAiAgents({ repoRoot: tmpRoot })
    resetAiAgentDiscoveryCache()
    const second = await discoverAiAgents({
      refresh: true,
      repoRoot: tmpRoot,
    })
    // Same shape (real discovery is deterministic on a given machine).
    expect(Object.keys(second).toSorted()).toEqual(
      Object.keys(first).toSorted(),
    )
  })

  test('reads the on-disk cache when in-process cache is empty', async () => {
    // Pre-populate the on-disk cache with a sentinel value, then make sure
    // discoverAiAgents reads it without invoking whichSync. The sentinel
    // path doesn't exist on disk; if discoverAiAgents falls through to
    // discoverFresh it would never produce this exact path.
    const cachePath = cachePathFor(tmpRoot)
    mkdirSync(path.dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({
        agents: { codex: '/sentinel/path/that/does/not/exist/codex' },
        writtenAt: Date.now(),
      }),
    )
    const out = await discoverAiAgents({ repoRoot: tmpRoot })
    expect(out).toEqual({ codex: '/sentinel/path/that/does/not/exist/codex' })
  })

  test('writes the disk cache after discovery', async () => {
    const cachePath = cachePathFor(tmpRoot)
    await discoverAiAgents({ repoRoot: tmpRoot })
    expect(existsSync(cachePath)).toBe(true)
  })

  test('resetAiAgentDiscoveryCache clears the in-process cache', async () => {
    await discoverAiAgents({ repoRoot: tmpRoot })
    expect(getDiscoveredAiAgents()).toBeDefined()
    resetAiAgentDiscoveryCache()
    expect(getDiscoveredAiAgents()).toBeUndefined()
  })

  // Note: the `repoRoot` default-to-cwd branch can't be exercised here —
  // vitest workers don't allow process.chdir(). The branch is trivially
  // covered by the function signature default.
})
