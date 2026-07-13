/**
 * @file Tests for src/external-tools/python/pin.ts. The filename/name parsers
 *   are pure and covered directly; `resolvePipPackagePin` is covered with
 *   mocked spawn + filesystem so the test never runs pip.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  normalizeDistName,
  parseArtifactFilename,
  specDistName,
} from '../../../../src/external-tools/python/pin'

import type * as NodeFs from 'node:fs'

vi.mock(import('../../../../src/process/spawn/child'), () => ({
  spawn: vi.fn(),
}))

vi.mock(import('../../../../src/fs/safe'), () => ({
  safeDelete: vi.fn(),
  safeMkdir: vi.fn(),
}))

vi.mock(import('node:fs'), async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      readdir: vi.fn(),
    },
  }
})

async function loadFresh() {
  const spawnMod = await import('../../../../src/process/spawn/child')
  const fsMod = await import('node:fs')
  const mod = await import('../../../../src/external-tools/python/pin')
  return {
    resolvePipPackagePin: mod.resolvePipPackagePin,
    PipPackagePinError: mod.PipPackagePinError,
    readdirMock: fsMod.promises.readdir as ReturnType<typeof vi.fn>,
    readFileMock: fsMod.promises.readFile as ReturnType<typeof vi.fn>,
    spawnMock: spawnMod.spawn as ReturnType<typeof vi.fn>,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('external-tools/python/pin — normalizeDistName', () => {
  test('lowercases and collapses _ . - runs to a single -', () => {
    expect(normalizeDistName('Is_Odd')).toBe('is-odd')
    expect(normalizeDistName('typing_extensions')).toBe('typing-extensions')
    expect(normalizeDistName('a.b__c')).toBe('a-b-c')
  })
})

describe('external-tools/python/pin — parseArtifactFilename', () => {
  test('parses a wheel filename', () => {
    expect(parseArtifactFilename('is_odd-3.0.1-py3-none-any.whl')).toEqual({
      name: 'is-odd',
      version: '3.0.1',
    })
  })

  test('parses an sdist tar.gz, splitting on the last dash before version', () => {
    expect(parseArtifactFilename('typing-extensions-4.12.2.tar.gz')).toEqual({
      name: 'typing-extensions',
      version: '4.12.2',
    })
  })

  test('parses a zip sdist', () => {
    expect(parseArtifactFilename('foo-1.0.zip')).toEqual({
      name: 'foo',
      version: '1.0',
    })
  })

  test('returns undefined for an unrecognized extension', () => {
    expect(parseArtifactFilename('README.md')).toBeUndefined()
  })
})

describe('external-tools/python/pin — specDistName', () => {
  test('strips a == version pin', () => {
    expect(specDistName('skillspector==1.0.0')).toBe('skillspector')
  })

  test('strips a >= range', () => {
    expect(specDistName('requests>=2.0')).toBe('requests')
  })

  test('extracts an #egg fragment from a git url', () => {
    expect(
      specDistName(
        'git+https://github.com/NVIDIA/skillspector.git@abc#egg=skillspector',
      ),
    ).toBe('skillspector')
  })

  test('falls back to the raw spec', () => {
    expect(specDistName('barenamenov')).toBe('barenamenov')
  })
})

describe.sequential('external-tools/python/pin — resolvePipPackagePin', () => {
  test('hashes the closure and builds a --require-hashes requirements body', async () => {
    const { resolvePipPackagePin, readFileMock, readdirMock, spawnMock } =
      await loadFresh()
    readdirMock.mockResolvedValueOnce([
      'is_odd-3.0.1-py3-none-any.whl',
      'is_number-1.0.0-py3-none-any.whl',
    ])
    // computeHashes hashes whatever bytes we hand back; distinct bytes →
    // distinct checksums.
    readFileMock.mockImplementation(async (p: string) =>
      Buffer.from(p.includes('is_odd') ? 'odd-bytes' : 'number-bytes'),
    )
    const pin = await resolvePipPackagePin({
      pythonBin: '/dlx/python/bin/python3',
      spec: 'is-odd==3.0.1',
    })
    // pip download was invoked, not pip install.
    const args = spawnMock.mock.calls[0]![1] as string[]
    expect(args).toContain('download')
    expect(args).toContain('--dest')
    expect(args).toContain('is-odd==3.0.1')
    // Top-level resolves to the spec's dist name.
    expect(pin.name).toBe('is-odd')
    expect(pin.version).toBe('3.0.1')
    expect(pin.artifacts).toHaveLength(2)
    // Requirements lines are name==version --hash=sha256:<hex>.
    const lines = pin.requirements.trim().split('\n')
    for (let i = 0, { length } = lines; i < length; i += 1) {
      const line = lines[i]!
      expect(line).toMatch(/^[\w-]+==[\d.]+ --hash=sha256:[a-f0-9]{64}$/)
    }
    expect(pin.hash.integrity).toMatch(/^sha512-/)
  })

  test('throws PipPackagePinError when pip download yields no artifacts', async () => {
    const { resolvePipPackagePin, PipPackagePinError, readdirMock } =
      await loadFresh()
    readdirMock.mockResolvedValueOnce(['some.txt', 'notes.log'])
    await expect(
      resolvePipPackagePin({
        pythonBin: '/dlx/python/bin/python3',
        spec: 'is-odd==3.0.1',
      }),
    ).rejects.toBeInstanceOf(PipPackagePinError)
  })

  test('throws PipPackagePinError on an empty spec', async () => {
    const { resolvePipPackagePin, PipPackagePinError } = await loadFresh()
    await expect(
      resolvePipPackagePin({ pythonBin: '/dlx/python/bin/python3', spec: '' }),
    ).rejects.toBeInstanceOf(PipPackagePinError)
  })

  test('falls back to the first artifact when the git spec name matches none', async () => {
    const { resolvePipPackagePin, readFileMock, readdirMock } =
      await loadFresh()
    // A git spec: the downloaded wheel is named after the project, not the URL.
    readdirMock.mockResolvedValueOnce(['skillspector-0.1.0-py3-none-any.whl'])
    readFileMock.mockResolvedValue(Buffer.from('wheel-bytes'))
    const pin = await resolvePipPackagePin({
      pythonBin: '/dlx/python/bin/python3',
      spec: 'git+https://github.com/NVIDIA/skillspector.git@abc1234',
    })
    // specDistName can't extract a name from the bare git URL, so top falls
    // back to the first (only) artifact.
    expect(pin.name).toBe('skillspector')
    expect(pin.version).toBe('0.1.0')
    expect(pin.artifacts).toHaveLength(1)
  })
})
