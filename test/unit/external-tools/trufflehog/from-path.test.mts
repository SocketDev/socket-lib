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
  const mod =
    await import('../../../../src/external-tools/trufflehog/from-path')
  return { whichMock, trufflehogFromPath: mod.trufflehogFromPath }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/trufflehog/from-path', () => {
  test('returns a resolved record with source="path" when which returns a string', async () => {
    const { trufflehogFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/local/bin/trufflehog')
    const result = await trufflehogFromPath()
    expect(result).toEqual({
      path: '/usr/local/bin/trufflehog',
      source: 'path',
    })
  })

  test('returns undefined when which returns null (not on PATH)', async () => {
    const { trufflehogFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    const result = await trufflehogFromPath()
    expect(result).toBeUndefined()
  })

  test('passes nothrow:true to which', async () => {
    const { trufflehogFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    await trufflehogFromPath()
    expect(whichMock).toHaveBeenCalledWith('trufflehog', { nothrow: true })
  })
})
