import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/bin/which', () => ({
  which:
    vi.fn<
      (name: string, opts?: { nothrow?: boolean }) => Promise<string | null>
    >(),
  whichSync: vi.fn(),
}))

async function loadFresh() {
  const whichMod = await import('../../../../src/bin/which')
  const whichMock = whichMod.which as ReturnType<typeof vi.fn>
  const mod = await import('../../../../src/external-tools/synp/from-path')
  return { whichMock, synpFromPath: mod.synpFromPath }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/synp/from-path', () => {
  test('returns a resolved record with source="path" when which returns a string', async () => {
    const { synpFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/local/bin/synp')
    const result = await synpFromPath()
    expect(result).toEqual({ path: '/usr/local/bin/synp', source: 'path' })
  })

  test('returns undefined when which returns null (not on PATH)', async () => {
    const { synpFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    const result = await synpFromPath()
    expect(result).toBeUndefined()
  })

  test('passes nothrow:true to which', async () => {
    const { synpFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    await synpFromPath()
    expect(whichMock).toHaveBeenCalledWith('synp', { nothrow: true })
  })
})
