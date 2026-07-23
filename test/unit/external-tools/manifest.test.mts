import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  getTool,
  getToolFlavor,
  isObject,
  parseChecksum,
  parsePlatforms,
  parseToolEntry,
  readExternalToolsManifest,
} from '../../../src/external-tools/manifest'

import type { Manifest } from '../../../src/external-tools/manifest'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

// SRI integrity per src/integrity.ts: prefix `sha512-` followed by base64.
const VALID_INTEGRITY = 'sha512-' + 'A'.repeat(86) + '=='

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'))
})

afterEach(async () => {
  await safeDelete(tmpRoot)
})

describe.sequential('isObject', () => {
  test('true for plain objects', () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ a: 1 })).toBe(true)
  })

  test('false for arrays', () => {
    expect(isObject([])).toBe(false)
    expect(isObject([1, 2])).toBe(false)
  })

  test('false for undefined (null branch is covered by the source typeguard)', () => {
    expect(isObject(undefined)).toBe(false)
  })

  test('false for primitives', () => {
    expect(isObject('s')).toBe(false)
    expect(isObject(42)).toBe(false)
    expect(isObject(undefined)).toBe(false)
    expect(isObject(true)).toBe(false)
  })
})

describe.sequential('parseChecksum', () => {
  test('returns a normalized ToolChecksum on a valid record', () => {
    const result = parseChecksum(
      { asset: 'tool.tar.gz', integrity: VALID_INTEGRITY },
      'mytool',
      'linux-x64',
    )
    expect(result).toEqual({ asset: 'tool.tar.gz', integrity: VALID_INTEGRITY })
  })

  test('throws when raw is not an object', () => {
    expect(() => parseChecksum('string-value', 'mytool', 'linux-x64')).toThrow(
      /must be an object/,
    )
  })

  test('throws when asset is missing', () => {
    expect(() =>
      parseChecksum({ integrity: VALID_INTEGRITY }, 'mytool', 'linux-x64'),
    ).toThrow(/non-empty 'asset' string/)
  })

  test('throws when asset is empty', () => {
    expect(() =>
      parseChecksum(
        { asset: '', integrity: VALID_INTEGRITY },
        'mytool',
        'linux-x64',
      ),
    ).toThrow(/non-empty 'asset' string/)
  })

  test('throws when integrity is missing', () => {
    expect(() =>
      parseChecksum({ asset: 'a.tar.gz' }, 'mytool', 'linux-x64'),
    ).toThrow(/invalid 'integrity'/)
  })

  test('throws when integrity is not a valid SRI string', () => {
    expect(() =>
      parseChecksum(
        { asset: 'a.tar.gz', integrity: 'not-sri' },
        'mytool',
        'linux-x64',
      ),
    ).toThrow(/invalid 'integrity'/)
  })
})

describe.sequential('parsePlatforms', () => {
  test('returns a map keyed by platform-arch', () => {
    const result = parsePlatforms(
      {
        'linux-x64': { asset: 'a.tar.gz', integrity: VALID_INTEGRITY },
        'darwin-arm64': { asset: 'b.tar.gz', integrity: VALID_INTEGRITY },
      },
      'mytool',
    )
    expect(Object.keys(result).toSorted()).toEqual([
      'darwin-arm64',
      'linux-x64',
    ])
    expect(result['linux-x64']!.asset).toBe('a.tar.gz')
  })

  test('throws when raw is not an object (undefined)', () => {
    expect(() => parsePlatforms(undefined, 'mytool')).toThrow(
      /missing a 'platforms' object/,
    )
  })

  test('throws when raw is an array', () => {
    expect(() => parsePlatforms([], 'mytool')).toThrow(
      /missing a 'platforms' object/,
    )
  })

  test('returns empty when input has no platforms', () => {
    expect(parsePlatforms({}, 'mytool')).toEqual({})
  })

  test('propagates per-platform validation errors with the platform key in the message', () => {
    expect(() =>
      parsePlatforms(
        { 'linux-x64': { asset: '', integrity: VALID_INTEGRITY } },
        'mytool',
      ),
    ).toThrow(/linux-x64/)
  })
})

describe.sequential('parseToolEntry', () => {
  test('returns kind="other" for a non-object', () => {
    expect(parseToolEntry('not-an-object', 't')).toEqual({
      kind: 'other',
      raw: 'not-an-object',
    })
  })

  test('returns kind="tool" for a valid plain entry', () => {
    const result = parseToolEntry(
      {
        description: 'demo',
        version: '1.0.0',
        release: 'asset',
        repository: 'github:owner/repo',
        platforms: {
          'linux-x64': { asset: 'a.tar.gz', integrity: VALID_INTEGRITY },
        },
      },
      'demo',
    )
    expect(result.kind).toBe('tool')
    if (result.kind === 'tool') {
      expect(result.entry.description).toBe('demo')
      expect(result.entry.version).toBe('1.0.0')
      expect(result.entry.repository).toBe('github:owner/repo')
      expect(result.entry.platforms['linux-x64']!.asset).toBe('a.tar.gz')
    }
  })

  test('returns kind="other" when platforms is present but required strings are missing', () => {
    const result = parseToolEntry(
      {
        platforms: { 'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY } },
        // missing description / version / release / repository
      },
      'demo',
    )
    expect(result.kind).toBe('other')
  })

  test('returns kind="tool" with optional fields when present', () => {
    const result = parseToolEntry(
      {
        description: 'demo',
        version: '1.0.0',
        release: 'asset',
        repository: 'github:owner/repo',
        binaryName: 'demo',
        notes: ['note one', 'note two'],
        platforms: {
          'linux-x64': { asset: 'a.tar.gz', integrity: VALID_INTEGRITY },
        },
      },
      'demo',
    )
    expect(result.kind).toBe('tool')
    if (result.kind === 'tool') {
      expect(result.entry.binaryName).toBe('demo')
      expect(result.entry.notes).toEqual(['note one', 'note two'])
    }
  })

  test('returns kind="flavored" when platforms is missing but inner objects have platforms', () => {
    const result = parseToolEntry(
      {
        description: 'sfw',
        version: '1.0.0',
        release: 'asset',
        free: {
          repository: 'github:socket/sfw-free',
          platforms: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
        enterprise: {
          repository: 'github:socket/sfw-enterprise',
          platforms: {
            'linux-x64': { asset: 'b', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result.kind).toBe('flavored')
    if (result.kind === 'flavored') {
      expect(Object.keys(result.entry.flavors).toSorted()).toEqual([
        'enterprise',
        'free',
      ])
    }
  })

  test('returns kind="other" for a non-flavored, non-tool object', () => {
    const result = parseToolEntry({ description: 'just-a-doc' }, 'rust')
    expect(result.kind).toBe('other')
  })
})

describe.sequential('getTool', () => {
  function manifestWith(entry: Manifest['tools'][string]): Manifest {
    return { tools: { mytool: entry } }
  }

  test('returns the tool entry when kind="tool"', () => {
    const entry = {
      description: 'd',
      version: '1',
      release: 'asset',
      repository: 'r',
      platforms: {},
    }
    const m = manifestWith({ kind: 'tool', entry })
    expect(getTool(m, 'mytool')).toBe(entry)
  })

  test('returns undefined for kind="flavored"', () => {
    const m = manifestWith({
      kind: 'flavored',
      entry: { description: '', version: '', release: '', flavors: {} },
    })
    expect(getTool(m, 'mytool')).toBeUndefined()
  })

  test('returns undefined for kind="other"', () => {
    const m = manifestWith({ kind: 'other', raw: undefined })
    expect(getTool(m, 'mytool')).toBeUndefined()
  })

  test('returns undefined for missing tool', () => {
    expect(getTool({ tools: {} }, 'nope')).toBeUndefined()
  })
})

describe.sequential('getToolFlavor', () => {
  test('returns the flavor when kind="flavored" and flavor exists', () => {
    const flavor = { repository: 'r', platforms: {} }
    const m: Manifest = {
      tools: {
        sfw: {
          kind: 'flavored',
          entry: {
            description: '',
            version: '',
            release: '',
            flavors: { free: flavor },
          },
        },
      },
    }
    expect(getToolFlavor(m, 'sfw', 'free')).toBe(flavor)
  })

  test('returns undefined when the flavor does not exist', () => {
    const m: Manifest = {
      tools: {
        sfw: {
          kind: 'flavored',
          entry: { description: '', version: '', release: '', flavors: {} },
        },
      },
    }
    expect(getToolFlavor(m, 'sfw', 'free')).toBeUndefined()
  })

  test('returns undefined when the entry is kind="tool"', () => {
    const m: Manifest = {
      tools: {
        sfw: {
          kind: 'tool',
          entry: {
            description: '',
            version: '',
            release: '',
            repository: '',
            platforms: {},
          },
        },
      },
    }
    expect(getToolFlavor(m, 'sfw', 'free')).toBeUndefined()
  })

  test('returns undefined when the tool is missing', () => {
    expect(getToolFlavor({ tools: {} }, 'sfw', 'free')).toBeUndefined()
  })
})

describe.sequential('readExternalToolsManifest', () => {
  test('reads a valid manifest and parses tool entries', async () => {
    const filepath = path.join(tmpRoot, 'external-tools.json')
    writeFileSync(
      filepath,
      JSON.stringify({
        mytool: {
          description: 'demo',
          version: '1.0.0',
          release: 'asset',
          repository: 'github:owner/repo',
          platforms: {
            'linux-x64': { asset: 'a.tar.gz', integrity: VALID_INTEGRITY },
          },
        },
      }),
    )
    const manifest = await readExternalToolsManifest(filepath)
    expect(manifest.tools['mytool']?.kind).toBe('tool')
  })

  test('skips $-prefixed JSON-Schema metadata keys', async () => {
    const filepath = path.join(tmpRoot, 'external-tools.json')
    writeFileSync(
      filepath,
      JSON.stringify({
        $schema: 'https://example.com/schema.json',
        mytool: {
          description: 'demo',
          version: '1.0.0',
          release: 'asset',
          repository: 'r',
          platforms: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      }),
    )
    const manifest = await readExternalToolsManifest(filepath)
    expect(Object.keys(manifest.tools)).toEqual(['mytool'])
  })

  test('throws when the file is not a top-level object', async () => {
    const filepath = path.join(tmpRoot, 'external-tools.json')
    writeFileSync(filepath, JSON.stringify([1, 2, 3]))
    await expect(readExternalToolsManifest(filepath)).rejects.toThrow(
      /expected top-level object/,
    )
  })

  test('parses flavored + other entries alongside plain ones', async () => {
    const filepath = path.join(tmpRoot, 'external-tools.json')
    writeFileSync(
      filepath,
      JSON.stringify({
        sfw: {
          description: 'socket firewall',
          version: '1.0.0',
          release: 'asset',
          free: {
            repository: 'github:socket/sfw-free',
            platforms: {
              'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
            },
          },
        },
        rust: { components: ['cargo'] },
      }),
    )
    const manifest = await readExternalToolsManifest(filepath)
    expect(manifest.tools['sfw']?.kind).toBe('flavored')
    expect(manifest.tools['rust']?.kind).toBe('other')
  })
})
