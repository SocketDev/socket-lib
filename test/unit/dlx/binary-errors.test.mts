/**
 * @file DLX binary cache-directory error coverage. The filesystem helper is
 *   mocked before loading the orchestrator so every errno-specific message is
 *   exercised without changing real directory permissions.
 */

import crypto from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as FsSafeModule from '../../../src/fs/safe'

async function loadWithMkdirError(code: string | undefined) {
  vi.resetModules()
  vi.doMock(import('../../../src/fs/safe'), async () => {
    const actual = await vi.importActual<typeof FsSafeModule>(
      '../../../src/fs/safe',
    )
    const error = new Error(code ?? 'generic mkdir failure')
    if (code !== undefined) {
      Object.assign(error, { code })
    }
    return {
      ...actual,
      safeMkdir: vi.fn().mockRejectedValue(error),
    }
  })
  return await import('../../../src/dlx/binary')
}

describe.sequential('dlx/binary cache directory errors', () => {
  afterEach(() => {
    vi.doUnmock(import('../../../src/fs/safe'))
  })

  it.each([
    ['EACCES', /Permission denied creating binary cache directory/],
    ['EPERM', /Permission denied creating binary cache directory/],
    ['EROFS', /read-only filesystem/],
    [undefined, /Failed to create binary cache directory/],
  ] as const)('wraps %s mkdir failures', async (code, message) => {
    const { dlxBinary } = await loadWithMkdirError(code)

    await expect(
      dlxBinary([], {
        name: `mkdir-error-${crypto.randomUUID()}`,
        url: 'https://example.invalid/binary',
      }),
    ).rejects.toThrow(message)
  })
})
