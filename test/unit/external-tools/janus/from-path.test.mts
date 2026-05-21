import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Mock the bin/which module to control whether the tool resolves.
vi.mock('../../../../src/bin/which', () => ({
  which: vi.fn<(name: string, opts?: { nothrow?: boolean }) => Promise<string | null>>(),
  whichSync: vi.fn(),
}))

async function loadFresh() {
  const whichMod = await import('../../../../src/bin/which')
  const whichMock = whichMod.which as ReturnType<typeof vi.fn>
  const mod = await import('../../../../src/external-tools/janus/from-path')
  return { whichMock, janusFromPath: mod.janusFromPath }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/janus/from-path', () => {
  test('returns a resolved record with source="path" when which returns a string', async () => {
    const { janusFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/local/bin/janus')
    const result = await janusFromPath()
    expect(result).toEqual({ path: '/usr/local/bin/janus', source: 'path' })
  })

  test('returns undefined when which returns null (not on PATH)', async () => {
    const { janusFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(null)
    const result = await janusFromPath()
    expect(result).toBeUndefined()
  })

  test('passes nothrow:true to which', async () => {
    const { janusFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(null)
    await janusFromPath()
    expect(whichMock).toHaveBeenCalledWith('janus', { nothrow: true })
  })
})
