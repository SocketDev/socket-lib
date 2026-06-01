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
  const mod = await import('../../../../src/external-tools/trivy/from-path')
  return { whichMock, trivyFromPath: mod.trivyFromPath }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/trivy/from-path', () => {
  test('returns a resolved record with source="path" when which returns a string', async () => {
    const { trivyFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/local/bin/trivy')
    const result = await trivyFromPath()
    expect(result).toEqual({ path: '/usr/local/bin/trivy', source: 'path' })
  })

  test('returns undefined when which returns null (not on PATH)', async () => {
    const { trivyFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    const result = await trivyFromPath()
    expect(result).toBeUndefined()
  })

  test('passes nothrow:true to which', async () => {
    const { trivyFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    await trivyFromPath()
    expect(whichMock).toHaveBeenCalledWith('trivy', { nothrow: true })
  })
})
