import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../../src/bin/which'), () => ({
  which:
    vi.fn<
      (
        name: string,
        opts?: { nothrow?: boolean | undefined } | undefined,
      ) => Promise<string | null>
    >(),
  whichSync: vi.fn(),
}))

async function loadFresh() {
  const whichMod = await import('../../../../src/bin/which')
  const whichMock = whichMod.which as ReturnType<typeof vi.fn>
  const mod = await import('../../../../src/external-tools/uv/from-path')
  return { whichMock, uvFromPath: mod.uvFromPath }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/uv/from-path', () => {
  test('returns a resolved record with source="path" when which returns a string', async () => {
    const { uvFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/local/bin/uv')
    const result = await uvFromPath()
    expect(result).toEqual({ path: '/usr/local/bin/uv', source: 'path' })
  })

  test('returns undefined when which returns null (not on PATH)', async () => {
    const { uvFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    const result = await uvFromPath()
    expect(result).toBeUndefined()
  })

  test('passes nothrow:true to which', async () => {
    const { uvFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    await uvFromPath()
    expect(whichMock).toHaveBeenCalledWith('uv', { nothrow: true })
  })
})
