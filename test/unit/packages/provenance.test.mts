/**
 * @file Unit tests for packages/provenance.ts — pure helpers for parsing and
 *   classifying SLSA attestation data. fetchPackageProvenance() hits the npm
 *   registry and is exercised via the integration suite; this file targets the
 *   synchronous parse/classify path used by the trusted-publisher gate.
 */

import { describe, expect, it } from 'vitest'

import {
  findProvenance,
  getAttestations,
  getProvenanceDetails,
  isTrustedPublisher,
} from '../../../src/packages/provenance'

describe('packages/provenance — getAttestations', () => {
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

describe('packages/provenance — findProvenance', () => {
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

describe('packages/provenance — getProvenanceDetails', () => {
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
                workflow_ref: 'https://gitlab.com/group/proj/.gitlab-ci.yml@main',
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

describe('packages/provenance — isTrustedPublisher', () => {
  it('returns false for non-string or empty input', () => {
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
