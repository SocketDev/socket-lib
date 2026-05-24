/**
 * @file Unit tests for github/refs-graphql.ts edge cases. httpRequest is
 *   mocked so no network is touched. Covers non-OK response, empty body,
 *   malformed JSON, branch-OID resolution path, and the tagRef-with-token
 *   header branch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/http-request/request')

import { fetchRefShaViaGraphQL } from '../../../src/github/refs-graphql'
import { httpRequest } from '../../../src/http-request/request'

const JSONStringify = JSON.stringify

function mkResponse(body: Buffer, ok: boolean, status: number) {
  return {
    body,
    headers: {},
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
  } as unknown as Awaited<ReturnType<typeof httpRequest>>
}

describe.sequential('github/refs-graphql — fetchRefShaViaGraphQL', () => {
  beforeEach(() => {
    vi.mocked(httpRequest).mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns undefined on non-OK status', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(Buffer.from(''), false, 503),
    )
    expect(
      await fetchRefShaViaGraphQL('o', 'r', 'v1.0.0', {}),
    ).toBeUndefined()
  })

  it('returns undefined when GraphQL returns empty body', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(Buffer.from(''), true, 200),
    )
    expect(
      await fetchRefShaViaGraphQL('o', 'r', 'v1.0.0', {}),
    ).toBeUndefined()
  })

  it('returns undefined on malformed JSON body', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(Buffer.from('<html>not json</html>'), true, 200),
    )
    expect(
      await fetchRefShaViaGraphQL('o', 'r', 'v1.0.0', {}),
    ).toBeUndefined()
  })

  it('returns branch OID when tagRef is null but branchRef resolves', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(
        Buffer.from(
          JSONStringify({
            data: {
              repository: {
                tagRef: null,
                branchRef: { target: { oid: 'sha-branch' } },
                commit: null,
              },
            },
          }),
        ),
        true,
        200,
      ),
    )
    expect(await fetchRefShaViaGraphQL('o', 'r', 'main', {})).toBe('sha-branch')
  })

  it('returns undefined when all three aliases are null', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(
        Buffer.from(
          JSONStringify({
            data: {
              repository: {
                tagRef: null,
                branchRef: null,
                commit: null,
              },
            },
          }),
        ),
        true,
        200,
      ),
    )
    expect(
      await fetchRefShaViaGraphQL('o', 'r', 'unknown', {}),
    ).toBeUndefined()
  })

  it('sends Authorization header when token option is provided', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(
        Buffer.from(
          JSONStringify({
            data: {
              repository: {
                branchRef: { target: { oid: 'sha-auth' } },
              },
            },
          }),
        ),
        true,
        200,
      ),
    )
    await fetchRefShaViaGraphQL('o', 'r', 'main', { token: 'gh-tok-xyz' })
    const call = vi.mocked(httpRequest).mock.calls[0]
    const opts = call?.[1] as { headers?: Record<string, string> }
    expect(opts?.headers?.['Authorization']).toBe('Bearer gh-tok-xyz')
  })
})
