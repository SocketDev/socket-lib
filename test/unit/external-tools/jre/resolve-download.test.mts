import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/jre/from-vfs', () => ({
  jreFromVfs: vi.fn(),
}))
vi.mock('../../../../src/external-tools/jre/from-java-home', () => ({
  jreFromJavaHome: vi.fn(),
}))
vi.mock('../../../../src/external-tools/jre/from-path', () => ({
  jreFromPath: vi.fn(),
}))
vi.mock('../../../../src/external-tools/jre/from-download', () => ({
  jreFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod = await import('../../../../src/external-tools/jre/from-vfs')
  const jhMod =
    await import('../../../../src/external-tools/jre/from-java-home')
  const pathMod = await import('../../../../src/external-tools/jre/from-path')
  const dlMod = await import('../../../../src/external-tools/jre/from-download')
  const mod = await import('../../../../src/external-tools/jre/resolve')
  return {
    fromVfs: vfsMod.jreFromVfs as ReturnType<typeof vi.fn>,
    fromJavaHome: jhMod.jreFromJavaHome as ReturnType<typeof vi.fn>,
    fromPath: pathMod.jreFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.jreFromDownload as ReturnType<typeof vi.fn>,
    doResolveJre: mod.doResolveJre,
    resolveJre: mod.resolveJre,
    resetJreResolution: mod.resetJreResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/jre/resolve — doResolveJre download tier', () => {
  test('returns JAVA_HOME result when from-java-home matches', async () => {
    const { doResolveJre, fromJavaHome, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = { javaHome: '/opt/jdk', source: 'java-home' as const }
    fromJavaHome.mockReturnValueOnce(expected)
    expect(await doResolveJre()).toBe(expected)
  })

  test('falls through to PATH when JAVA_HOME misses', async () => {
    const { doResolveJre, fromJavaHome, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromJavaHome.mockReturnValueOnce(undefined)
    const expected = { javaHome: '/usr', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveJre()).toBe(expected)
  })

  test('falls through to download when all local tiers miss + opts.downloadIfMissing is set', async () => {
    const { doResolveJre, fromDownload, fromJavaHome, fromPath, fromVfs } =
      await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromJavaHome.mockReturnValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = {
      javaHome: '/cache/jdk',
      source: 'download' as const,
    }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = {
      downloadIfMissing: { version: 17, platformArch: 'darwin-arm64' },
    }
    expect(await doResolveJre(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })

  test('returns undefined when all tiers miss and download is not enabled', async () => {
    const { doResolveJre, fromJavaHome, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromJavaHome.mockReturnValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveJre()).toBeUndefined()
  })
})

describe.sequential('external-tools/jre/resolve — resolveJre memoization isolation', () => {
  test('local-only and downloadIfMissing options memoize separately', async () => {
    const { fromDownload, fromJavaHome, fromPath, fromVfs, resolveJre } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    fromJavaHome.mockReturnValue(undefined)
    fromPath.mockResolvedValue(undefined)
    const dl = { javaHome: '/cache/jdk', source: 'download' as const }
    fromDownload.mockResolvedValue(dl)
    const localOnly = await resolveJre()
    const withDl = await resolveJre({
      downloadIfMissing: { version: 17, platformArch: 'darwin-arm64' },
    })
    expect(localOnly).toBeUndefined()
    expect(withDl).toBe(dl)
  })
})
