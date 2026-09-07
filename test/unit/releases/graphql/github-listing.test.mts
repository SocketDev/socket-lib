import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockHttpResponse } from '../../util/http-mock.mjs'

vi.mock(import('../../../../src/http-request/request.mjs'))
const JSONStringify = JSON.stringify

afterEach(() => {
  vi.resetAllMocks()
})

describe('GraphQL release rows', () => {
  it('returns prototype-free release rows with normalized assets', async () => {
    vi.resetModules()
    const { fetchReleasesViaGraphQL } =
      await import('../../../../src/releases/github-listing.mjs')
    const { httpRequest } =
      await import('../../../../src/http-request/request.mjs')
    vi.mocked(httpRequest).mockResolvedValueOnce(
      createMockHttpResponse(
        Buffer.from(
          JSONStringify({
            data: {
              repository: {
                releases: {
                  nodes: [
                    {
                      tagName: 'v1.2.3',
                      publishedAt: '2026-01-01T00:00:00Z',
                      releaseAssets: { nodes: [{ name: 'example.tar.gz' }] },
                    },
                    { tagName: 'v1.2.2', publishedAt: '2025-12-01T00:00:00Z' },
                  ],
                },
              },
            },
          }),
        ),
        true,
        200,
      ),
    )
    const rows = await fetchReleasesViaGraphQL(
      'example-owner',
      'example-repository',
    )
    expect(rows).toEqual([
      {
        tag_name: 'v1.2.3',
        published_at: '2026-01-01T00:00:00Z',
        assets: [{ name: 'example.tar.gz' }],
      },
      { tag_name: 'v1.2.2', published_at: '2025-12-01T00:00:00Z', assets: [] },
    ])
    for (const row of rows) {
      expect(Object.getPrototypeOf(row)).toBeNull()
    }
  })
})
