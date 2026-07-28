/**
 * @file Unit tests for `src/npm/registry.ts`'s `parseProvenancePredicate` —
 *   parsing the npm transparency-log attestation bundle down to the SLSA
 *   provenance predicate, including every malformed-entry `continue` path
 *   (missing/invalid verificationMaterial, non-JSON content, a non-string or
 *   non-decodable payload, a missing predicate field). Split out of
 *   `registry.test.mts` to keep each file under the fleet's 500-line soft cap.
 *   Pure-parser tests use sample JSON fixtures (no network).
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parseProvenancePredicate } from '../../../src/npm/registry'

import type { AttestationBundle } from '../../../src/npm/registry'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.resolve(testDir, '../../fixtures/npm')
const localRequire = createRequire(import.meta.url)

const attestationFixture = localRequire(
  path.join(fixturesDir, 'attestation-bundle.json'),
) as AttestationBundle

describe('parseProvenancePredicate', () => {
  it('parses a well-formed attestation bundle fixture', () => {
    const predicate = parseProvenancePredicate(attestationFixture)
    expect(predicate).toBeDefined()
    const workflow = predicate?.buildDefinition?.externalParameters?.workflow
    expect(workflow?.repository).toBe('https://github.com/expressjs/express')
    expect(workflow?.path).toBe('.github/workflows/release.yml')
    expect(workflow?.ref).toBe('refs/tags/v5.0.0')
  })

  it('returns undefined for undefined input', () => {
    expect(parseProvenancePredicate(undefined)).toBeUndefined()
  })

  it('returns undefined when attestations array is absent', () => {
    expect(parseProvenancePredicate({ other: 'data' })).toBeUndefined()
  })

  it('returns undefined when attestations is not an array', () => {
    expect(
      parseProvenancePredicate({ attestations: 'not-an-array' }),
    ).toBeUndefined()
  })

  it('returns undefined when no SLSA v1 predicate is found', () => {
    const bundle: AttestationBundle = {
      attestations: [
        { predicateType: 'https://other.predicate.type/v1', bundle: {} },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('returns undefined for an empty attestations array', () => {
    expect(parseProvenancePredicate({ attestations: [] })).toBeUndefined()
  })

  it('skips entries with no bundle', () => {
    const bundle: AttestationBundle = {
      attestations: [
        { predicateType: 'https://slsa.dev/provenance/v1', bundle: undefined },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('skips an entry whose verificationMaterial is missing or not an object', () => {
    const bundle: AttestationBundle = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: { verificationMaterial: undefined },
        },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('skips an entry whose verificationMaterial has no string content', () => {
    const bundle: AttestationBundle = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: { verificationMaterial: {} },
        },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('skips an entry whose content is not valid JSON', () => {
    const bundle: AttestationBundle = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: { verificationMaterial: { content: '{not valid json' } },
        },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('skips an entry whose parsed content is not an object', () => {
    const bundle: AttestationBundle = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: {
            verificationMaterial: { content: JSON.stringify('just a string') },
          },
        },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('skips an entry whose envelope has no string payload', () => {
    const bundle: AttestationBundle = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: {
            verificationMaterial: {
              content: JSON.stringify({ noPayload: true }),
            },
          },
        },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('skips an entry whose payload does not decode to valid JSON', () => {
    const bundle: AttestationBundle = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: {
            verificationMaterial: {
              content: JSON.stringify({ payload: btoa('not valid json{') }),
            },
          },
        },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('skips an entry whose decoded payload is not an object', () => {
    const bundle: AttestationBundle = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: {
            verificationMaterial: {
              content: JSON.stringify({
                payload: btoa(JSON.stringify('a string value')),
              }),
            },
          },
        },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })

  it('skips an entry whose decoded payload has no predicate field', () => {
    const bundle: AttestationBundle = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: {
            verificationMaterial: {
              content: JSON.stringify({
                payload: btoa(JSON.stringify({ noPredicate: true })),
              }),
            },
          },
        },
      ],
    }
    expect(parseProvenancePredicate(bundle)).toBeUndefined()
  })
})
