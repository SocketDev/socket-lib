import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  getTool,
  getToolFlavor,
  isObject,
  parseChecksum,
  parseChecksums,
  parseToolEntry,
  readExternalToolsManifest,
  tryParseFlavored,
} from '../../../src/external-tools/manifest'

import type { Manifest } from '../../../src/external-tools/manifest'

// SRI integrity per src/integrity.ts: prefix `sha512-` followed by base64.
const VALID_INTEGRITY = 'sha512-' + 'A'.repeat(86) + '=='

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'))
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
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

describe.sequential('parseChecksums', () => {
  test('returns a map keyed by platform-arch', () => {
    const result = parseChecksums(
      {
        'linux-x64': { asset: 'a.tar.gz', integrity: VALID_INTEGRITY },
        'darwin-arm64': { asset: 'b.tar.gz', integrity: VALID_INTEGRITY },
      },
      'mytool',
    )
    expect(Object.keys(result).sort()).toEqual(['darwin-arm64', 'linux-x64'])
    expect(result['linux-x64']!.asset).toBe('a.tar.gz')
  })

  test('throws when raw is not an object (undefined)', () => {
    expect(() => parseChecksums(undefined, 'mytool')).toThrow(
      /missing a 'checksums' object/,
    )
  })

  test('throws when raw is an array', () => {
    expect(() => parseChecksums([], 'mytool')).toThrow(
      /missing a 'checksums' object/,
    )
  })

  test('returns empty when input has no platforms', () => {
    expect(parseChecksums({}, 'mytool')).toEqual({})
  })

  test('propagates per-platform validation errors with the platform key in the message', () => {
    expect(() =>
      parseChecksums(
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
        checksums: {
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
      expect(result.entry.checksums['linux-x64']!.asset).toBe('a.tar.gz')
    }
  })

  test('returns kind="other" when checksums is present but required strings are missing', () => {
    const result = parseToolEntry(
      {
        checksums: { 'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY } },
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
        checksums: {
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

  test('returns kind="flavored" when checksums is missing but inner objects have checksums', () => {
    const result = parseToolEntry(
      {
        description: 'sfw',
        version: '1.0.0',
        release: 'asset',
        free: {
          repository: 'github:socket/sfw-free',
          checksums: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
        enterprise: {
          repository: 'github:socket/sfw-enterprise',
          checksums: {
            'linux-x64': { asset: 'b', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result.kind).toBe('flavored')
    if (result.kind === 'flavored') {
      expect(Object.keys(result.entry.flavors).sort()).toEqual([
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

describe.sequential('tryParseFlavored', () => {
  test('returns undefined when no inner objects have checksums', () => {
    expect(
      tryParseFlavored({ description: 'x', version: '1' }, 'rust'),
    ).toBeUndefined()
  })

  test('returns a flavored entry with version/description/release strings', () => {
    const result = tryParseFlavored(
      {
        description: 'sfw',
        version: '1.0.0',
        release: 'asset',
        free: {
          repository: 'github:socket/sfw-free',
          checksums: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.description).toBe('sfw')
    expect(result?.version).toBe('1.0.0')
    expect(result?.release).toBe('asset')
    expect(result?.flavors['free']?.repository).toBe('github:socket/sfw-free')
  })

  test('skips flavor candidates without a repository', () => {
    const result = tryParseFlavored(
      {
        // free has no `repository` so it is NOT recognized as a flavor.
        free: {
          checksums: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result).toBeUndefined()
  })

  test('defaults description/version/release to empty strings when missing', () => {
    const result = tryParseFlavored(
      {
        free: {
          repository: 'github:socket/sfw-free',
          checksums: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.description).toBe('')
    expect(result?.version).toBe('')
    expect(result?.release).toBe('')
  })

  test('preserves notes array when present', () => {
    const result = tryParseFlavored(
      {
        description: 'sfw',
        notes: ['n1'],
        free: {
          repository: 'r',
          checksums: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.notes).toEqual(['n1'])
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
      checksums: {},
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
    const flavor = { repository: 'r', checksums: {} }
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
            checksums: {},
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
          checksums: {
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
          checksums: {
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
            checksums: {
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

describe.sequential('tryParseFlavored — skip invalid flavor candidates', () => {
  test('skips a flavor candidate whose checksums field is not an object', () => {
    const result = tryParseFlavored(
      {
        description: 'sfw',
        // free has bad checksums shape → skipped.
        free: {
          repository: 'github:socket/sfw-free',
          checksums: 'not-an-object',
        },
        // enterprise is valid → kept.
        enterprise: {
          repository: 'github:socket/sfw-enterprise',
          checksums: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.flavors['free']).toBeUndefined()
    expect(result?.flavors['enterprise']).toBeDefined()
  })

  test('omits binaryName when the field is not a string', () => {
    const result = tryParseFlavored(
      {
        description: 'sfw',
        free: {
          repository: 'github:socket/sfw-free',
          binaryName: 42,
          checksums: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.flavors['free']?.binaryName).toBeUndefined()
  })
})
