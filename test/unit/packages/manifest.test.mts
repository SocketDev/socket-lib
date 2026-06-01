/**
 * @file Unit tests for packages/manifest.ts. Covers the pure helper
 *   `createPackageJson` + the network fns `fetchPackageManifest` /
 *   `fetchPackagePackument` via pacote mocks (no real network).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock pacote BEFORE importing src/packages/manifest so the mocked
// pacote.manifest / pacote.packument are seen by the SUT.
vi.mock(import('../../../src/external/pacote'), () => ({
  default: {
    manifest: vi.fn(),
    packument: vi.fn(),
    tarball: vi.fn(),
    extract: vi.fn(),
  },
}))

import {
  createPackageJson,
  fetchPackageManifest,
  fetchPackagePackument,
} from '../../../src/packages/manifest'
import pacote from '../../../src/external/pacote'

describe.sequential('packages/manifest — createPackageJson', () => {
  it('builds the canonical shape from minimal input', () => {
    const pkg = createPackageJson('is-number', 'packages/npm/is-number')
    expect(pkg.name).toBe('@socketregistry/is-number')
    expect(pkg.license).toBe('MIT')
    expect(pkg.homepage).toContain('packages/npm/is-number')
    expect(pkg.repository).toMatchObject({
      type: 'git',
      directory: 'packages/npm/is-number',
    })
    expect(pkg.sideEffects).toBe(false)
    // Default files when none provided.
    expect(pkg.files).toEqual(['*.d.ts', '*.js'])
    // Default categories when no `socket` block provided.
    expect(
      (pkg.socket as { categories: string[] }).categories.length,
    ).toBeGreaterThan(0)
  })

  it('strips a leading @scope/ prefix from sockRegPkgName', () => {
    const pkg = createPackageJson('@scope/foo', 'pkg-path')
    // Result is @socketregistry/<stripped>; the strip is best-effort.
    expect(pkg.name?.startsWith('@socketregistry/')).toBe(true)
  })

  it('passes through version + description + keywords', () => {
    const pkg = createPackageJson('foo', 'p', {
      version: '1.2.3',
      description: 'desc',
      keywords: ['k1', 'k2'],
    })
    expect(pkg.version).toBe('1.2.3')
    expect(pkg.description).toBe('desc')
    expect(pkg.keywords).toEqual(['k1', 'k2'])
  })

  it('emits `type` only when provided', () => {
    const noType = createPackageJson('a', 'p')
    expect(noType['type']).toBeUndefined()
    const withType = createPackageJson('a', 'p', { type: 'module' })
    expect(withType['type']).toBe('module')
  })

  it('emits `exports` block when entryExports is a plain object', () => {
    const pkg = createPackageJson('a', 'p', {
      exports: { '.': './index.js' },
    })
    expect(pkg.exports).toEqual({ '.': './index.js' })
    // When exports is set, no main is emitted.
    expect(pkg.main).toBeUndefined()
  })

  it('emits `main` (with default ./index.js) when exports is absent', () => {
    const pkg = createPackageJson('a', 'p')
    expect(pkg.main).toBe('./index.js')
  })

  it('honors caller-supplied main when exports is absent', () => {
    const pkg = createPackageJson('a', 'p', { main: './alt.js' })
    expect(pkg.main).toBe('./alt.js')
  })

  it('coerces sideEffects to a boolean', () => {
    expect(createPackageJson('a', 'p', { sideEffects: true }).sideEffects).toBe(
      true,
    )
    expect(
      createPackageJson('a', 'p', { sideEffects: false }).sideEffects,
    ).toBe(false)
    // Truthy non-boolean → true
    expect(
      createPackageJson('a', 'p', {
        sideEffects: 'maybe' as unknown as boolean,
      }).sideEffects,
    ).toBe(true)
  })

  it('passes through dependencies / overrides / resolutions when plain objects', () => {
    const pkg = createPackageJson('a', 'p', {
      dependencies: { lodash: '^4.17.21' },
      overrides: { foo: '1.0.0' },
      resolutions: { bar: '2.0.0' },
    })
    expect(pkg.dependencies).toEqual({ lodash: '^4.17.21' })
    expect(pkg.overrides).toEqual({ foo: '1.0.0' })
    expect(pkg.resolutions).toEqual({ bar: '2.0.0' })
  })

  it('drops dependencies / overrides / resolutions when not plain objects', () => {
    const pkg = createPackageJson('a', 'p', {
      dependencies: 'not-an-object' as unknown as Record<string, string>,
      overrides: [] as unknown as Record<string, string>,
    })
    expect(pkg.dependencies).toBeUndefined()
    expect(pkg.overrides).toBeUndefined()
  })

  it('substitutes the fleet-default node range when caller-supplied node engine is below it', () => {
    // packageDefaultNodeRange enforces a floor; a very old range like "^12"
    // should be replaced with the fleet default.
    const pkg = createPackageJson('a', 'p', { engines: { node: '^12' } })
    expect(pkg.engines?.['node']).not.toBe('^12')
    expect(typeof pkg.engines?.['node']).toBe('string')
  })

  it('preserves a caller-supplied node engine when it satisfies the fleet default', () => {
    // Use a range high enough that any reasonable fleet default is satisfied.
    const pkg = createPackageJson('a', 'p', { engines: { node: '>=99' } })
    expect(pkg.engines?.['node']).toBe('>=99')
  })

  it('preserves non-node engine keys verbatim', () => {
    const pkg = createPackageJson('a', 'p', {
      engines: { node: '>=99', npm: '>=9' },
    })
    expect(pkg.engines?.['npm']).toBe('>=9')
  })

  it('passes through caller-supplied files list (sliced)', () => {
    const files = ['custom.js', 'README.md']
    const pkg = createPackageJson('a', 'p', { files })
    expect(pkg.files).toEqual(files)
    // Sliced, not aliased.
    expect(pkg.files).not.toBe(files)
  })

  it('passes through caller-supplied socket block (spread)', () => {
    const socket = { categories: ['cleanup'] as const }
    const pkg = createPackageJson('a', 'p', {
      socket: socket as unknown as Record<string, unknown>,
    })
    expect(pkg.socket).toEqual({ categories: ['cleanup'] })
  })
})

describe.sequential('packages/manifest — fetchPackageManifest', () => {
  beforeEach(() => {
    vi.mocked(pacote.manifest).mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the pacote result directly when spec is a registry type', async () => {
    vi.mocked(pacote.manifest).mockResolvedValueOnce({
      name: 'lodash',
      version: '4.17.21',
    } as unknown as ReturnType<typeof pacote.manifest>)
    const result = await fetchPackageManifest('lodash@4.17.21')
    expect(result).toEqual({ name: 'lodash', version: '4.17.21' })
    expect(pacote.manifest).toHaveBeenCalledTimes(1)
  })

  it('returns undefined when pacote throws', async () => {
    vi.mocked(pacote.manifest).mockRejectedValueOnce(new Error('boom'))
    const result = await fetchPackageManifest('does-not-exist@1.0.0')
    expect(result).toBeUndefined()
  })

  it('returns undefined when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await fetchPackageManifest('lodash@4.17.21', {
      signal: controller.signal,
    } as unknown as Parameters<typeof fetchPackageManifest>[1])
    expect(result).toBeUndefined()
    expect(pacote.manifest).not.toHaveBeenCalled()
  })

  it('returns undefined when pacote returns falsy', async () => {
    vi.mocked(pacote.manifest).mockResolvedValueOnce(
      undefined as unknown as ReturnType<typeof pacote.manifest>,
    )
    const result = await fetchPackageManifest('lodash@4.17.21')
    expect(result).toBeUndefined()
  })

  it('re-fetches with name@version when spec is non-registry (file path)', async () => {
    // First call: pacote returns a manifest for the file path spec.
    // Second call: pacote returns the manifest for the resolved name@version.
    const resolved = { name: 'pkg-from-path', version: '1.2.3' }
    vi.mocked(pacote.manifest)
      .mockResolvedValueOnce(
        resolved as unknown as ReturnType<typeof pacote.manifest>,
      )
      .mockResolvedValueOnce({
        ...resolved,
        registryFetched: true,
      } as unknown as ReturnType<typeof pacote.manifest>)
    const result = (await fetchPackageManifest('./local-pkg')) as {
      name: string
      registryFetched?: boolean | undefined
    }
    // Second pacote call should be against name@version form.
    const secondCallArg = vi.mocked(pacote.manifest).mock.calls[1]?.[0]
    expect(typeof secondCallArg).toBe('string')
    expect(secondCallArg).toContain('pkg-from-path@1.2.3')
    expect(result.registryFetched).toBe(true)
  })
})

describe.sequential('packages/manifest — fetchPackagePackument', () => {
  beforeEach(() => {
    vi.mocked(pacote.packument).mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the packument from pacote.packument', async () => {
    const packument = { name: 'lodash', 'dist-tags': { latest: '4.17.21' } }
    vi.mocked(pacote.packument).mockResolvedValueOnce(
      packument as unknown as ReturnType<typeof pacote.packument>,
    )
    expect(await fetchPackagePackument('lodash')).toEqual(packument)
  })

  it('returns undefined when pacote.packument throws', async () => {
    vi.mocked(pacote.packument).mockRejectedValueOnce(new Error('network'))
    expect(await fetchPackagePackument('does-not-exist')).toBeUndefined()
  })
})
