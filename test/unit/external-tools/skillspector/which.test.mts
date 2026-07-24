import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type * as whichModule from '../../../../src/bin/which'

vi.mock(
  import('../../../../src/bin/which'),
  () =>
    ({
      which:
        vi.fn<
          (
            name: string,
            opts?: { nothrow?: boolean | undefined } | undefined,
          ) => Promise<string | undefined>
        >(),
      whichSync: vi.fn(),
    }) as unknown as typeof whichModule,
)

async function loadFresh() {
  const whichMod = await import('../../../../src/bin/which')
  const whichMock = whichMod.which as ReturnType<typeof vi.fn>
  const mod =
    await import('../../../../src/external-tools/skillspector/from-path')
  return { whichMock, skillspectorFromPath: mod.skillspectorFromPath }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/skillspector/from-path', () => {
  test('returns undefined when which returns undefined (not on PATH)', async () => {
    const { skillspectorFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    expect(await skillspectorFromPath()).toBeUndefined()
  })

  test('returns source="path" for a non-pipx binary', async () => {
    const { skillspectorFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/local/bin/skillspector')
    const result = await skillspectorFromPath()
    expect(result).toEqual({
      path: '/usr/local/bin/skillspector',
      source: 'path',
    })
  })

  test('returns source="pipx" for a pipx venv path (linux/macOS)', async () => {
    const { skillspectorFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(
      '/home/user/.local/pipx/venvs/skillspector/bin/skillspector',
    )
    const result = await skillspectorFromPath()
    expect(result?.source).toBe('pipx')
  })

  test('returns source="pipx" for an XDG pipx venv path', async () => {
    const { skillspectorFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(
      '/home/user/.local/share/pipx/venvs/skillspector/bin/skillspector',
    )
    const result = await skillspectorFromPath()
    expect(result?.source).toBe('pipx')
  })

  test('returns source="pipx" for a Windows pipx venv path', async () => {
    const { skillspectorFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(
      'C:\\Users\\me\\pipx\\venvs\\skillspector\\Scripts\\skillspector.exe',
    )
    const result = await skillspectorFromPath()
    expect(result?.source).toBe('pipx')
  })

  test('passes nothrow:true to which', async () => {
    const { skillspectorFromPath, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    await skillspectorFromPath()
    expect(whichMock).toHaveBeenCalledWith('skillspector', { nothrow: true })
  })

  test('does not match pipx-like paths that lack the venvs segment', async () => {
    const { skillspectorFromPath, whichMock } = await loadFresh()
    // A binary that says "pipx" in its name but isn't under pipx/venvs/
    whichMock.mockResolvedValueOnce('/opt/my-pipx-clone/bin/skillspector')
    const result = await skillspectorFromPath()
    expect(result?.source).toBe('path')
  })
})
