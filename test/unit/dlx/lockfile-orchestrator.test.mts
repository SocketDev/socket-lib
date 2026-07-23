/**
 * @file Deterministic coverage for resolveNpmPackagePin. Registry-facing
 *   collaborators are mocked so the orchestration, age conversion, hashing,
 *   result construction, and cleanup behavior run in the ordinary unit tier.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { safeIdealTree, writeSafeNpmrc } from '../../../src/dlx/arborist'
import { resolveNpmPackagePin } from '../../../src/dlx/lockfile'
import pacote from '../../../src/external/pacote'
import { safeDelete } from '../../../src/fs/safe'

import type * as ArboristModule from '../../../src/dlx/arborist'
import type * as PacoteModule from '../../../src/external/pacote'
import type * as FsSafeModule from '../../../src/fs/safe'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

vi.mock(import('../../../src/dlx/arborist'), async importOriginal => {
  const original = await importOriginal<typeof ArboristModule>()
  return {
    ...original,
    safeIdealTree: vi.fn(),
    writeSafeNpmrc: vi.fn(),
  }
})

vi.mock(import('../../../src/external/pacote'), async importOriginal => {
  const original = await importOriginal<typeof PacoteModule>()
  return {
    ...original,
    default: {
      ...original.default,
      tarball: vi.fn(),
    },
  }
})

vi.mock(import('../../../src/fs/safe'), async importOriginal => {
  const original = await importOriginal<typeof FsSafeModule>()
  return {
    ...original,
    safeDelete: vi.fn(original.safeDelete),
  }
})

describe.sequential('dlx/lockfile orchestrator', () => {
  beforeEach(() => {
    vi.mocked(safeIdealTree).mockResolvedValue({
      integrity: 'sha512-registry-value',
      lockfile: '{"lockfileVersion":3}',
      name: 'fixture-package',
      version: '1.2.3',
    })
    vi.mocked(writeSafeNpmrc).mockResolvedValue(undefined)
    vi.mocked(pacote.tarball).mockResolvedValue(
      Buffer.from('fixture tarball bytes'),
    )
    vi.mocked(safeDelete).mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('resolves a pin and converts a minute-based release age', async () => {
    const startedAt = Date.now()
    const result = await resolveNpmPackagePin({
      minReleaseMins: 10,
      spec: 'fixture-package@^1.0.0',
    })

    expect(result).toMatchObject({
      lockfile: '{"lockfileVersion":3}',
      name: 'fixture-package',
      version: '1.2.3',
    })
    expect(result.hash.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(result.hash.integrity).toMatch(/^sha512-/)
    expect(result.packageJson).toContain('"fixture-package": "^1.0.0"')

    const idealOptions = vi.mocked(safeIdealTree).mock.calls[0]![0]
    expect(idealOptions.before).toBeInstanceOf(Date)
    expect(idealOptions.before!.getTime()).toBeGreaterThanOrEqual(
      startedAt - 10 * 60_000 - 1000,
    )
    expect(vi.mocked(writeSafeNpmrc)).toHaveBeenCalledWith(idealOptions.path, {
      minReleaseDays: undefined,
      minReleaseMins: 10,
    })
    expect(vi.mocked(pacote.tarball)).toHaveBeenCalledWith(
      'fixture-package@1.2.3',
    )
    expect(vi.mocked(safeDelete)).toHaveBeenCalledWith(idealOptions.path, {
      force: true,
    })
  })

  it('returns the pin when scratch cleanup fails', async () => {
    vi.mocked(safeDelete).mockRejectedValueOnce(new Error('cleanup failed'))

    const result = await resolveNpmPackagePin({
      minReleaseDays: 0,
      spec: 'fixture-package@1.2.3',
    })
    const idealOptions = vi.mocked(safeIdealTree).mock.calls[0]![0]

    expect(result.version).toBe('1.2.3')
    expect(idealOptions.before).toBeUndefined()
    safeDeleteSync(idealOptions.path)
  })
})
