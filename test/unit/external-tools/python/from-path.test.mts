/**
 * @file Tests for `pythonFromPath` - the first tier of Python resolution. The
 *   probe order is the behaviour: `python3` is the POSIX spelling and `python`
 *   on many systems is Python 2 or a stub that prompts an install, so falling
 *   back to it before trying `python3` would resolve the wrong interpreter.
 *   `which` is mocked because the answer must not depend on what happens to be
 *   installed on the machine running the suite.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(import('../../../../src/exe/path/which.mjs'), () => ({
  which: vi.fn(),
}))

async function loadFresh() {
  const whichMod = await import('../../../../src/exe/path/which.mjs')
  const mod =
    await import('../../../../src/external-tools/python/from-path.mjs')
  return {
    pythonFromPath: mod.pythonFromPath,
    whichMock: whichMod.which as ReturnType<typeof vi.fn>,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('pythonFromPath', () => {
  it('returns the python3 hit tagged as coming from PATH', async () => {
    const { pythonFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValue('/usr/bin/python3')
    expect(await pythonFromPath()).toEqual({
      path: '/usr/bin/python3',
      source: 'path',
    })
  })

  it('asks for python3 before python', async () => {
    // `python` is Python 2 or an install-prompt stub on plenty of systems.
    const { pythonFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValue('/usr/bin/python3')
    await pythonFromPath()
    expect(whichMock).toHaveBeenCalledTimes(1)
    expect(whichMock.mock.calls[0]?.[0]).toBe('python3')
  })

  it('falls back to python when python3 is absent', async () => {
    const { pythonFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    whichMock.mockResolvedValueOnce('C:\\Python\\python.exe')
    expect(await pythonFromPath()).toEqual({
      path: 'C:\\Python\\python.exe',
      source: 'path',
    })
    expect(whichMock.mock.calls[1]?.[0]).toBe('python')
  })

  it('answers undefined when neither name is on PATH', async () => {
    const { pythonFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValue(undefined)
    expect(await pythonFromPath()).toBe(undefined)
    expect(whichMock).toHaveBeenCalledTimes(2)
  })

  it('probes without throwing so a miss stays a miss', async () => {
    // The caller falls through to the download tier; a throw here would take
    // the whole resolution down instead.
    const { pythonFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValue(undefined)
    await pythonFromPath()
    for (const call of whichMock.mock.calls) {
      expect(call[1]).toEqual({ nothrow: true })
    }
  })
})
