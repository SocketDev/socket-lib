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
  const mod = await import('../../../../src/external-tools/opengrep/from-path')
  return { whichMock, opengrepFromPath: mod.opengrepFromPath }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/opengrep/from-path', () => {
  test('returns a resolved record with source="path" when which returns a string', async () => {
    const { opengrepFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/local/bin/opengrep')
    const result = await opengrepFromPath()
    expect(result).toEqual({ path: '/usr/local/bin/opengrep', source: 'path' })
  })

  test('returns undefined when which returns null (not on PATH)', async () => {
    const { opengrepFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    const result = await opengrepFromPath()
    expect(result).toBeUndefined()
  })

  test('passes nothrow:true to which', async () => {
    const { opengrepFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    await opengrepFromPath()
    expect(whichMock).toHaveBeenCalledWith('opengrep', { nothrow: true })
  })
})
