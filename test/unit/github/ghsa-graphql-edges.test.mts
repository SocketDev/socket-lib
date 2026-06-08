/**
 * @file Unit tests for github/ghsa.ts edge cases in
 *   `fetchGhsaDetailsViaGraphQL` — empty body and malformed JSON paths.
 *   httpRequest is mocked at the module boundary so no network is touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(import('../../../src/http-request/request'))

import { fetchGhsaDetailsViaGraphQL } from '../../../src/github/ghsa'
import { GitHubEmptyBodyError } from '../../../src/github/errors'
import { httpRequest } from '../../../src/http-request/request'

const JSONStringify = JSON.stringify

// socket-lint: allow boolean-trap -- local test fixture builder; the
// (body, ok, status) shape mirrors the httpRequest return it stands in for.
function mkResponse(body: Buffer, ok: boolean, status: number) {
  return {
    body,
    headers: {},
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
  } as unknown as Awaited<ReturnType<typeof httpRequest>>
}

describe.sequential('github/ghsa — fetchGhsaDetailsViaGraphQL edges', () => {
  beforeEach(() => {
    vi.mocked(httpRequest).mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('throws on non-OK status', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(Buffer.from(''), false, 502),
    )
    await expect(fetchGhsaDetailsViaGraphQL('GHSA-xxxx')).rejects.toThrow(
      /GitHub GraphQL API error 502/,
    )
  })

  it('throws GitHubEmptyBodyError when 200 OK + empty body', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(Buffer.from(''), true, 200),
    )
    await expect(fetchGhsaDetailsViaGraphQL('GHSA-empty')).rejects.toThrow(
      GitHubEmptyBodyError,
    )
  })

  it('throws on malformed JSON body', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(Buffer.from('<html>not json</html>'), true, 200),
    )
    await expect(fetchGhsaDetailsViaGraphQL('GHSA-bad-json')).rejects.toThrow(
      /Failed to parse GitHub GraphQL response for advisory GHSA-bad-json/,
    )
  })

  it('throws when GraphQL returns errors[]', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(
        Buffer.from(
          JSONStringify({ errors: [{ message: 'Bad credentials' }] }),
        ),
        true,
        200,
      ),
    )
    await expect(fetchGhsaDetailsViaGraphQL('GHSA-auth')).rejects.toThrow(
      /Bad credentials/,
    )
  })

  it('throws when securityAdvisory is null (not found)', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(
        // oxlint-disable-next-line socket/prefer-undefined-over-null -- GraphQL spec returns null for unresolved nodes
        Buffer.from(JSONStringify({ data: { securityAdvisory: null } })),
        true,
        200,
      ),
    )
    await expect(fetchGhsaDetailsViaGraphQL('GHSA-missing')).rejects.toThrow(
      /GHSA-missing/,
    )
  })

  it('returns the parsed GhsaDetails on a valid response', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(
      mkResponse(
        Buffer.from(
          JSONStringify({
            data: {
              securityAdvisory: {
                ghsaId: 'GHSA-1234',
                summary: 'Sample vulnerability',
                description: 'desc',
                severity: 'HIGH',
                publishedAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-02T00:00:00Z',
                // oxlint-disable-next-line socket/prefer-undefined-over-null -- GraphQL spec returns null for unresolved nodes
                withdrawnAt: null,
                cvss: { score: 7.5, vectorString: 'CVSS:3.1/AV:N' },
                cwes: {
                  nodes: [{ cweId: 'CWE-79', name: 'XSS', description: 'd' }],
                },
                references: [{ url: 'https://example.com/advisory' }],
                vulnerabilities: {
                  nodes: [
                    {
                      package: { ecosystem: 'NPM', name: 'foo' },
                      vulnerableVersionRange: '< 1.2.3',
                      firstPatchedVersion: { identifier: '1.2.3' },
                    },
                  ],
                },
                identifiers: [{ type: 'GHSA', value: 'GHSA-1234' }],
              },
            },
          }),
        ),
        true,
        200,
      ),
    )
    const result = await fetchGhsaDetailsViaGraphQL('GHSA-1234')
    expect(result.ghsaId).toBe('GHSA-1234')
    expect(String(result.severity).toLowerCase()).toBe('high')
    expect(result.cvss?.score).toBe(7.5)
    expect(result.references?.[0]?.url).toBe('https://example.com/advisory')
  })
})
