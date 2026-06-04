/**
 * @file Tests for src/external-tools/python/dlx.ts. The wrappers compose
 *   resolvePython + a pip primitive; both are mocked so the test neither
 *   downloads a Python nor runs pip.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../../src/external-tools/python/resolve'), () => ({
  resolvePython: vi.fn(),
}))

vi.mock(import('../../../../src/external-tools/python/pip-install'), () => ({
  downloadPipPackage: vi.fn(),
}))

vi.mock(import('../../../../src/external-tools/python/pin'), () => ({
  resolvePipPackagePin: vi.fn(),
}))

async function loadFresh() {
  const resolveMod =
    await import('../../../../src/external-tools/python/resolve')
  const pipMod =
    await import('../../../../src/external-tools/python/pip-install')
  const pinMod = await import('../../../../src/external-tools/python/pin')
  const mod = await import('../../../../src/external-tools/python/dlx')
  return {
    dlxPipInstall: mod.dlxPipInstall,
    dlxPipPin: mod.dlxPipPin,
    DlxPythonUnavailableError: mod.DlxPythonUnavailableError,
    downloadPipPackageMock: pipMod.downloadPipPackage as ReturnType<
      typeof vi.fn
    >,
    resolvePipPackagePinMock: pinMod.resolvePipPackagePin as ReturnType<
      typeof vi.fn
    >,
    resolvePythonMock: resolveMod.resolvePython as ReturnType<typeof vi.fn>,
  }
}

const PIN = { tag: '20260203', version: '3.11.14' }

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/python/dlx — dlxPipInstall', () => {
  test('resolves the interpreter then pip-installs, threading pythonBin', async () => {
    const { dlxPipInstall, downloadPipPackageMock, resolvePythonMock } =
      await loadFresh()
    resolvePythonMock.mockResolvedValueOnce({
      path: '/dlx/python/bin/python3',
      source: 'download',
    })
    downloadPipPackageMock.mockResolvedValueOnce({
      installed: true,
      packageDir: '/dlx/abc/site-packages',
    })
    const result = await dlxPipInstall({
      python: PIN,
      spec: 'skillspector==1.0.0',
    })
    // resolvePython got the pin as downloadIfMissing.
    const resolveArg = resolvePythonMock.mock.calls[0]![0]
    expect(resolveArg.downloadIfMissing.version).toBe('3.11.14')
    expect(resolveArg.downloadIfMissing.tag).toBe('20260203')
    // pip got the resolved path.
    expect(downloadPipPackageMock.mock.calls[0]![0].pythonBin).toBe(
      '/dlx/python/bin/python3',
    )
    expect(result.pythonBin).toBe('/dlx/python/bin/python3')
    expect(result.packageDir).toBe('/dlx/abc/site-packages')
    expect(result.installed).toBe(true)
  })

  test('forwards hash to downloadPipPackage', async () => {
    const { dlxPipInstall, downloadPipPackageMock, resolvePythonMock } =
      await loadFresh()
    resolvePythonMock.mockResolvedValueOnce({ path: '/py', source: 'path' })
    downloadPipPackageMock.mockResolvedValueOnce({
      installed: true,
      packageDir: '/d',
    })
    await dlxPipInstall({ hash: 'deadbeef', python: PIN, spec: 'x==1' })
    expect(downloadPipPackageMock.mock.calls[0]![0].hash).toBe('deadbeef')
  })

  test('throws DlxPythonUnavailableError when resolvePython misses', async () => {
    const {
      dlxPipInstall,
      DlxPythonUnavailableError,
      downloadPipPackageMock,
      resolvePythonMock,
    } = await loadFresh()
    resolvePythonMock.mockResolvedValueOnce(undefined)
    await expect(
      dlxPipInstall({ python: PIN, spec: 'x==1' }),
    ).rejects.toBeInstanceOf(DlxPythonUnavailableError)
    expect(downloadPipPackageMock).not.toHaveBeenCalled()
  })
})

describe.sequential('external-tools/python/dlx — dlxPipPin', () => {
  test('resolves the interpreter then pins, threading pythonBin', async () => {
    const { dlxPipPin, resolvePipPackagePinMock, resolvePythonMock } =
      await loadFresh()
    resolvePythonMock.mockResolvedValueOnce({ path: '/py', source: 'path' })
    resolvePipPackagePinMock.mockResolvedValueOnce({
      artifacts: [],
      hash: { checksum: 'c', integrity: 'sha512-x' },
      name: 'skillspector',
      requirements: 'skillspector==1.0.0 --hash=sha256:c\n',
      version: '1.0.0',
    })
    const pin = await dlxPipPin({ python: PIN, spec: 'skillspector==1.0.0' })
    expect(resolvePipPackagePinMock.mock.calls[0]![0].pythonBin).toBe('/py')
    expect(pin.pythonBin).toBe('/py')
    expect(pin.name).toBe('skillspector')
  })
})
