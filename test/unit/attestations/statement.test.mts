import { describe, expect, it } from 'vitest'
import { parseAttestationStatement } from '../../../src/attestations/_internal/statement.mts'

const subject = { digest: { sha256: 'a'.repeat(64) }, name: 'example.tar.gz' }
const jsonNull: unknown = JSON.parse('null')
const predicateType = 'https://example.com/release/v1'
const statement = {
  _type: 'https://in-toto.io/Statement/v1',
  predicate: { revision: 'release' },
  predicateType,
  subject: [subject],
}

describe('authenticated attestation statement validation', () => {
  it('preserves predicate data for caller-specific validation', () => {
    expect(
      parseAttestationStatement(
        JSON.stringify(statement),
        subject,
        predicateType,
      ),
    ).toEqual(statement)
  })
  it('rejects duplicate expected subjects even with the same digest', () => {
    expect(() =>
      parseAttestationStatement(
        JSON.stringify({ ...statement, subject: [subject, subject] }),
        subject,
        predicateType,
      ),
    ).toThrow('exactly one')
  })
  it.each([
    jsonNull,
    [],
    {},
    { ...statement, _type: 'https://in-toto.io/Statement/v0.1' },
    { ...statement, predicate: undefined },
  ])('rejects a malformed statement', invalid => {
    expect(() =>
      parseAttestationStatement(
        JSON.stringify(invalid),
        subject,
        predicateType,
      ),
    ).toThrow()
  })
  it.each([
    jsonNull,
    { name: 'other', digest: jsonNull },
    { name: 'other', digest: { sha256: 1 } },
  ])('rejects malformed other subjects', invalid => {
    expect(() =>
      parseAttestationStatement(
        JSON.stringify({ ...statement, subject: [subject, invalid] }),
        subject,
        predicateType,
      ),
    ).toThrow('malformed')
  })
})
