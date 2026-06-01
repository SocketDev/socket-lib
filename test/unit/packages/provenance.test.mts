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
vi.mock(import('../../../src/external/make-fetch-happen'), () => ({
  default: {
    defaults: vi.fn(() => mockFetcher),
  },
}))

import {
  TRUST_LEVELS,
  compareTrust,
  didTrustDecrease,
  fetchPackageProvenance,
  findProvenance,
  getAttestations,
  getProvenanceDetails,
  getTrustLevel,
  getTrustLevelName,
  getTrustStatus,
  isTrustedPublisher,
} from '../../../src/packages/provenance'

const fullyTrustedDoc = {
  _npmUser: { name: 'someone', trustedPublisher: { id: 'github' } },
  dist: { attestations: { provenance: { predicateType: 'slsa' } } },
}
const provenanceOnlyDoc = {
  _npmUser: { name: 'someone' },
  dist: { attestations: { provenance: { predicateType: 'slsa' } } },
}
const bareDoc = {
  _npmUser: { name: 'someone' },
  dist: { tarball: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz' },
}
const stagedPublishDoc = {
  _npmUser: {
    name: 'someone',
    approver: { name: 'approver-bot' },
    trustedPublisher: { id: 'github' },
  },
  dist: { attestations: { provenance: { predicateType: 'slsa' } } },
}
const stagedPublishOnlyDoc = {
  _npmUser: { name: 'someone', approver: 'approver-bot' },
  dist: { tarball: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz' },
}

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

describe('packages/provenance — trust status', () => {
  it('getTrustStatus returns all-false for non-object input', () => {
    expect(getTrustStatus(undefined)).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
    expect(getTrustStatus('nope')).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
  })

  it('getTrustStatus reads provenance + trustedPublisher from a full doc', () => {
    expect(getTrustStatus(fullyTrustedDoc)).toEqual({
      provenance: true,
      trustedPublisher: true,
      stagedPublish: false,
    })
  })

  it('getTrustStatus reads provenance only when no trusted publisher', () => {
    expect(getTrustStatus(provenanceOnlyDoc)).toEqual({
      provenance: true,
      trustedPublisher: false,
      stagedPublish: false,
    })
  })

  it('getTrustStatus returns all-false for a bare doc', () => {
    expect(getTrustStatus(bareDoc)).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
  })

  it('getTrustStatus reads stagedPublish from _npmUser.approver (per pnpm#12056)', () => {
    expect(getTrustStatus(stagedPublishOnlyDoc)).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: true,
    })
  })

  it('getTrustStatus reads stagedPublish alongside trustedPublisher + provenance', () => {
    expect(getTrustStatus(stagedPublishDoc)).toEqual({
      provenance: true,
      trustedPublisher: true,
      stagedPublish: true,
    })
  })

  it('getTrustStatus ignores falsy approver values', () => {
    expect(
      getTrustStatus({
        _npmUser: { name: 'someone', approver: undefined },
        dist: {},
      }),
    ).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
    expect(
      getTrustStatus({
        _npmUser: { name: 'someone', approver: '' },
        dist: {},
      }),
    ).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- registry JSON may carry null; tested explicitly as a falsy form.
    expect(getTrustStatus({ _npmUser: { approver: null }, dist: {} })).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
  })

  it('getTrustLevel maps statuses to the 0..3 ladder', () => {
    expect(getTrustLevel(getTrustStatus(bareDoc))).toBe(0)
    expect(getTrustLevel(getTrustStatus(provenanceOnlyDoc))).toBe(1)
    expect(getTrustLevel(getTrustStatus(fullyTrustedDoc))).toBe(2)
    expect(getTrustLevel(getTrustStatus(stagedPublishDoc))).toBe(3)
    expect(getTrustLevel(getTrustStatus(stagedPublishOnlyDoc))).toBe(3)
  })

  it('getTrustLevelName maps statuses to names', () => {
    expect(getTrustLevelName(getTrustStatus(bareDoc))).toBe('none')
    expect(getTrustLevelName(getTrustStatus(provenanceOnlyDoc))).toBe(
      'provenance',
    )
    expect(getTrustLevelName(getTrustStatus(fullyTrustedDoc))).toBe(
      'trustedPublisher',
    )
    expect(getTrustLevelName(getTrustStatus(stagedPublishDoc))).toBe(
      'stagedPublish',
    )
    expect(getTrustLevelName(getTrustStatus(stagedPublishOnlyDoc))).toBe(
      'stagedPublish',
    )
  })

  it('compareTrust compares by trust level', () => {
    const bare = getTrustStatus(bareDoc)
    const prov = getTrustStatus(provenanceOnlyDoc)
    const full = getTrustStatus(fullyTrustedDoc)
    const staged = getTrustStatus(stagedPublishDoc)
    expect(compareTrust(bare, full)).toBe(-1)
    expect(compareTrust(full, bare)).toBe(1)
    expect(compareTrust(prov, prov)).toBe(0)
    expect(compareTrust(full, staged)).toBe(-1)
    expect(compareTrust(staged, full)).toBe(1)
  })

  it('didTrustDecrease detects a drop in trust level', () => {
    const bare = getTrustStatus(bareDoc)
    const full = getTrustStatus(fullyTrustedDoc)
    const staged = getTrustStatus(stagedPublishDoc)
    expect(didTrustDecrease(full, bare)).toBe(true)
    expect(didTrustDecrease(bare, full)).toBe(false)
    expect(didTrustDecrease(full, full)).toBe(false)
    expect(didTrustDecrease(staged, full)).toBe(true)
    expect(didTrustDecrease(full, staged)).toBe(false)
  })

  it('TRUST_LEVELS index round-trips with getTrustLevel', () => {
    expect(TRUST_LEVELS).toEqual([
      'none',
      'provenance',
      'trustedPublisher',
      'stagedPublish',
    ])
    // The index IS the level: TRUST_LEVELS[getTrustLevel(x)] === name.
    for (const status of [
      getTrustStatus(bareDoc),
      getTrustStatus(provenanceOnlyDoc),
      getTrustStatus(fullyTrustedDoc),
      getTrustStatus(stagedPublishOnlyDoc),
      getTrustStatus(stagedPublishDoc),
    ]) {
      expect(TRUST_LEVELS[getTrustLevel(status)]).toBe(
        getTrustLevelName(status),
      )
    }
  })
})
