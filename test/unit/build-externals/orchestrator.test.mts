import { promises as fs } from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as BundleConfig from '../../../scripts/repo/build-externals/config.mts'

const fixtures = vi.hoisted(() => {
  const external: typeof BundleConfig.externalPackages = []
  const scoped: typeof BundleConfig.scopedPackages = []
  return { __proto__: null, external, scoped }
})

vi.mock(import('../../../scripts/repo/build-externals/config.mts'), () => ({
  externalPackages: fixtures.external,
  scopedPackages: fixtures.scoped,
}))
vi.mock(import('../../../scripts/repo/build-externals/bundler.mts'), () => ({
  bundlePackage: vi.fn(),
}))
vi.mock(import('../../../scripts/repo/build-externals/copy-files.mts'), () => ({
  ensureDir: vi.fn(),
  copyLocalFiles: vi.fn(),
}))
vi.mock(
  import('../../../scripts/repo/build-externals/transform-primordials.mts'),
  () => ({ transformPrimordials: vi.fn() }),
)

import {
  buildExternals,
  bundleAllPackages,
} from '../../../scripts/repo/build-externals/orchestrator.mts'
import { bundlePackage } from '../../../scripts/repo/build-externals/bundler.mts'
import { copyLocalFiles } from '../../../scripts/repo/build-externals/copy-files.mts'
import { transformPrimordials } from '../../../scripts/repo/build-externals/transform-primordials.mts'

beforeEach(() => {
  fixtures.external.length = 0
  fixtures.scoped.length = 0
  vi.mocked(bundlePackage).mockReset().mockResolvedValue(0)
  vi.mocked(copyLocalFiles).mockClear()
  vi.mocked(transformPrimordials).mockClear()
  vi.spyOn(fs, 'copyFile').mockResolvedValue()
  vi.spyOn(fs, 'readdir').mockResolvedValue([])
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('external bundle orchestration', () => {
  it('counts only nonempty bundles and copies thin wrappers', async () => {
    fixtures.external.push(
      { name: 'example-bundle', bundle: true },
      { name: 'example-empty', bundle: true },
      { name: 'example-wrapper', bundle: false },
    )
    vi.mocked(bundlePackage).mockResolvedValueOnce(5).mockResolvedValueOnce(0)
    const result = await bundleAllPackages({ quiet: true })
    expect(result).toEqual({ bundledCount: 1, totalSize: 5 })
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(fs.copyFile).toHaveBeenCalledWith(
      expect.stringContaining('example-wrapper.js'),
      expect.stringContaining('example-wrapper.js'),
    )
  })

  it('continues past optional failures and handles multiple scoped packages', async () => {
    fixtures.scoped.push(
      { scope: '@example', packages: ['optional'], optional: true },
      {
        scope: '@example',
        packages: ['first', 'second'],
        bundle: true,
        subpaths: [],
      },
    )
    vi.mocked(bundlePackage)
      .mockRejectedValueOnce(new Error('optional fixture'))
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
    expect(await bundleAllPackages({ quiet: true })).toEqual({
      bundledCount: 2,
      totalSize: 7,
    })
    expect(vi.mocked(bundlePackage).mock.calls.map(call => call[0])).toEqual([
      '@example/optional',
      '@example/first',
      '@example/second',
    ])
  })

  it('propagates required bundle failures', async () => {
    fixtures.scoped.push({ scope: '@example', name: 'required', bundle: true })
    const failure = new Error('required fixture')
    vi.mocked(bundlePackage).mockRejectedValueOnce(failure)
    await expect(bundleAllPackages({ quiet: true })).rejects.toBe(failure)
  })

  it('preserves explicit subpath extensions and copies unbundled scoped wrappers', async () => {
    fixtures.scoped.push({
      scope: '@example',
      packages: ['first', 'second'],
      bundle: false,
      subpaths: ['library/value', 'library/extra.js'],
    })
    await bundleAllPackages({ quiet: true })
    expect(fs.copyFile).toHaveBeenCalledTimes(2)
    expect(
      vi.mocked(bundlePackage).mock.calls.map(call => path.basename(call[1])),
    ).toEqual(['value.js', 'extra.js'])
  })

  it('runs the transform before copying local declarations', async () => {
    const result = await buildExternals({ quiet: true })
    expect(result).toEqual({ bundledCount: 0, totalSize: 0 })
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(fs.readdir).toHaveBeenCalledTimes(2)
    expect(transformPrimordials).toHaveBeenCalledOnce()
    expect(copyLocalFiles).toHaveBeenCalledOnce()
    expect(
      vi.mocked(transformPrimordials).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(copyLocalFiles).mock.invocationCallOrder[0]!)
  })
})
