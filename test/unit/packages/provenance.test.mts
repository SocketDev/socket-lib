/**
 * @file Unit tests for packages/provenance.ts. Covers the pure helpers
 *   (findProvenance / getAttestations / getProvenanceDetails /
 *   isTrustedPublisher) + fetchPackageProvenance via a make-fetch-happen mock
 *   (no network).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock make-fetch-happen BEFORE importing provenance so the SUT picks up
// the mocked fetcher factory.
const mockFetcher = vi.fn()
vi.mock('../../../src/external/make-fetch-happen', () => ({
  default: {
    defaults: vi.fn(() => mockFetcher),
  },
}))

import {
  fetchPackageProvenance,
  findProvenance,
  getAttestations,
  getProvenanceDetails,
  isTrustedPublisher,
} from '../../../src/packages/provenance'

describe.sequential('packages/provenance — getAttestations', () => {
  it('returns [] when input has no attestations field', () => {
    expect(getAttestations({})).toEqual([])
  })

  it('returns [] when attestations is not an array', () => {
    expect(getAttestations({ attestations: 'not-an-array' })).toEqual([])
  })

  it('filters to SLSA v0.2 and v1 predicate types', () => {
    const data = {
      attestations: [
        { predicateType: 'https://slsa.dev/provenance/v0.2' },
        { predicateType: 'https://slsa.dev/provenance/v1' },
        { predicateType: 'https://example.org/unrelated' },
        { predicateType: 'https://in-toto.io/Statement/v1' },
      ],
    }
    const result = getAttestations(data)
    expect(result).toHaveLength(2)
  })

  it('returns [] when attestations is empty array', () => {
    expect(getAttestations({ attestations: [] })).toEqual([])
  })
})

describe.sequential('packages/provenance — findProvenance', () => {
  it('returns undefined for an empty list', () => {
    expect(findProvenance([])).toBeUndefined()
  })

  it('returns provenance shape when predicate is directly available', () => {
    const att = {
      predicate: {
        buildDefinition: {
          externalParameters: { workflow: { ref: 'refs/heads/main' } },
        },
      },
    }
    const result = findProvenance([att]) as {
      predicate: unknown
      externalParameters: unknown
    }
    expect(result.predicate).toBe(att.predicate)
    expect(result.externalParameters).toEqual({
      workflow: { ref: 'refs/heads/main' },
    })
  })

  it('decodes predicate from DSSE envelope payload when not directly present', () => {
    const statement = {
      predicate: {
        buildDefinition: {
          externalParameters: { workflow: { ref: 'refs/heads/dsse' } },
        },
      },
    }
    const payload = Buffer.from(JSON.stringify(statement), 'utf8').toString(
      'base64',
    )
    const att = { bundle: { dsseEnvelope: { payload } } }
    const result = findProvenance([att]) as {
      externalParameters: { workflow: { ref: string } }
    }
    expect(result.externalParameters.workflow.ref).toBe('refs/heads/dsse')
  })

  it('skips entries with neither predicate nor decodable payload', () => {
    const att = { bundle: { dsseEnvelope: { payload: 'not-valid-base64!!!' } } }
    expect(findProvenance([att])).toBeUndefined()
  })

  it('returns undefined when predicate lacks buildDefinition.externalParameters', () => {
    const att = { predicate: { buildDefinition: {} } }
    expect(findProvenance([att])).toBeUndefined()
  })
})

describe.sequential('packages/provenance — getProvenanceDetails', () => {
  it('returns undefined when no SLSA attestations present', () => {
    expect(getProvenanceDetails({ attestations: [] })).toBeUndefined()
  })

  it('returns { level: "attested" } when attestations exist but no parseable provenance', () => {
    const data = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v0.2',
          predicate: { buildDefinition: {} },
        },
      ],
    }
    expect(getProvenanceDetails(data)).toEqual({ level: 'attested' })
  })

  it('extracts SLSA v1 nested workflow shape into details', () => {
    const data = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          predicate: {
            buildDefinition: {
              buildType: 'https://actions.github.io/buildtypes/workflow/v1',
              externalParameters: {
                workflow: {
                  ref: 'refs/heads/main',
                  repository: 'owner/repo',
                },
                context: 'https://github.com/owner/repo/actions/runs/1',
                ref: 'refs/heads/main',
                sha: 'abc123',
                run_id: '1',
              },
            },
          },
        },
      ],
    }
    const details = getProvenanceDetails(data) as {
      level: string
      commitSha: string
      repository: string
      workflowRunId: string
    }
    expect(details.level).toBe('trusted')
    expect(details.commitSha).toBe('abc123')
    expect(details.repository).toBe('owner/repo')
    expect(details.workflowRunId).toBe('1')
  })

  it('marks as "trusted" when repository hostname is gitlab.com', () => {
    const data = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v0.2',
          predicate: {
            buildDefinition: {
              externalParameters: {
                workflow_ref:
                  'https://gitlab.com/group/proj/.gitlab-ci.yml@main',
              },
            },
          },
        },
      ],
    }
    const details = getProvenanceDetails(data) as { level: string }
    expect(details.level).toBe('trusted')
  })

  it('marks as "attested" (not trusted) when no recognized publisher', () => {
    const data = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v0.2',
          predicate: {
            buildDefinition: {
              externalParameters: {
                workflow_ref: 'https://example.org/repo/ci.yml@main',
              },
            },
          },
        },
      ],
    }
    const details = getProvenanceDetails(data) as { level: string }
    expect(details.level).toBe('attested')
  })
})

describe.sequential('packages/provenance — isTrustedPublisher', () => {
  it('returns false for non-string or empty input', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- callers may pass null; tested explicitly.
    expect(isTrustedPublisher(null)).toBe(false)
    expect(isTrustedPublisher(undefined)).toBe(false)
    expect(isTrustedPublisher(42)).toBe(false)
    expect(isTrustedPublisher('')).toBe(false)
  })

  it('returns true for github.com URLs', () => {
    expect(isTrustedPublisher('https://github.com/o/r')).toBe(true)
    expect(isTrustedPublisher('https://api.github.com/repos/o/r')).toBe(true)
  })

  it('returns true for gitlab.com URLs', () => {
    expect(isTrustedPublisher('https://gitlab.com/g/p')).toBe(true)
    expect(isTrustedPublisher('https://nested.gitlab.com/path')).toBe(true)
  })

  it('handles workflow @-suffix by splitting on @', () => {
    expect(
      isTrustedPublisher(
        'https://github.com/o/r/.github/workflows/ci.yml@refs/heads/main',
      ),
    ).toBe(true)
  })

  it('handles @-suffix where first part is also not a URL', () => {
    // "@" is present, but the value before "@" isn't a valid URL either.
    // The fall-through then tries `https://` prefix and matches.
    expect(isTrustedPublisher('github.com/o/r@refs/heads/main')).toBe(true)
  })

  it('handles @-suffix where first part is empty after split', () => {
    // Edge: split returns ['', ...] — the inner if(firstPart) guard fires.
    expect(isTrustedPublisher('@github.com/o')).toBe(true)
  })

  it('returns true for bare hostnames (synthetic https:// prefix)', () => {
    expect(isTrustedPublisher('github.com/o/r')).toBe(true)
    expect(isTrustedPublisher('gitlab.com/g/p')).toBe(true)
  })

  it('falls back to substring match for strings without a hostname', () => {
    // Empty / whitespace-stripped strings still pass the typeof guard
    // but won't yield a hostname from parseUrl. URL "http://" parses
    // with an empty hostname; "http:" alone is also unparseable in node URL.
    // Use a value that contains the substring but no URL form: a plain
    // identifier that survives the hostname check.
    expect(isTrustedPublisher('runner:github')).toBe(true)
    expect(isTrustedPublisher('runner:gitlab')).toBe(true)
  })

  it('returns false for unrelated hostnames', () => {
    expect(isTrustedPublisher('https://example.org/foo')).toBe(false)
    expect(isTrustedPublisher('https://bitbucket.org/o/r')).toBe(false)
  })

  it('returns false for malformed-but-known-bad strings', () => {
    expect(isTrustedPublisher('not a url not even close')).toBe(false)
  })
})

describe.sequential('packages/provenance — fetchPackageProvenance', () => {
  beforeEach(() => {
    mockFetcher.mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns details when the registry responds with attestation data', async () => {
    const attestationData = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          predicate: {
            buildDefinition: {
              externalParameters: {
                workflow: {
                  ref: 'https://github.com/o/r/.github/workflows/ci.yml@refs/heads/main',
                  repository: 'o/r',
                },
                ref: 'refs/heads/main',
                sha: 'abc',
                run_id: '99',
              },
            },
          },
        },
      ],
    }
    mockFetcher.mockResolvedValueOnce({
      ok: true,
      json: async () => attestationData,
    })
    const result = (await fetchPackageProvenance('lodash', '4.17.21')) as {
      level: string
      commitSha: string
    }
    expect(result.level).toBe('trusted')
    expect(result.commitSha).toBe('abc')
    expect(mockFetcher).toHaveBeenCalledTimes(1)
    const call = mockFetcher.mock.calls[0]
    expect(String(call?.[0])).toContain('attestations/lodash')
  })

  it('returns undefined when response is not ok', async () => {
    mockFetcher.mockResolvedValueOnce({ ok: false, status: 404 })
    expect(
      await fetchPackageProvenance('does-not-exist', '1.0.0'),
    ).toBeUndefined()
  })

  it('returns undefined when fetcher throws', async () => {
    mockFetcher.mockRejectedValueOnce(new Error('network'))
    expect(await fetchPackageProvenance('lodash', '4.17.21')).toBeUndefined()
  })

  it('returns undefined when caller-supplied signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await fetchPackageProvenance('lodash', '4.17.21', {
      signal: controller.signal,
    } as unknown as Parameters<typeof fetchPackageProvenance>[2])
    expect(result).toBeUndefined()
    expect(mockFetcher).not.toHaveBeenCalled()
  })

  it('URL-encodes the package name + version', async () => {
    mockFetcher.mockResolvedValueOnce({ ok: false, status: 404 })
    await fetchPackageProvenance('@scope/with space', '1.0.0+meta')
    const url = String(mockFetcher.mock.calls[0]?.[0])
    expect(url).toContain('%40scope%2Fwith%20space')
    expect(url).toContain('1.0.0%2Bmeta')
  })
})
