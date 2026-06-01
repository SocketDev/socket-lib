import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../../src/bin/which'), () => ({
  which:
    vi.fn<
      (
        name: string,
        opts?: { nothrow?: boolean | undefined },
      ) => Promise<string | null>
    >(),
  whichSync: vi.fn(),
}))

async function loadFresh() {
  const whichMod = await import('../../../../src/bin/which')
  const whichMock = whichMod.which as ReturnType<typeof vi.fn>
  const mod = await import('../../../../src/external-tools/cdxgen/from-path')
  return { whichMock, cdxgenFromPath: mod.cdxgenFromPath }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/cdxgen/from-path', () => {
  test('returns a resolved record with source="path" when which returns a string', async () => {
    const { cdxgenFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/local/bin/cdxgen')
    const result = await cdxgenFromPath()
    expect(result).toEqual({ path: '/usr/local/bin/cdxgen', source: 'path' })
  })

  test('returns undefined when which returns null (not on PATH)', async () => {
    const { cdxgenFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    const result = await cdxgenFromPath()
    expect(result).toBeUndefined()
  })

  test('passes nothrow:true to which', async () => {
    const { cdxgenFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    await cdxgenFromPath()
    expect(whichMock).toHaveBeenCalledWith('cdxgen', { nothrow: true })
  })
})
