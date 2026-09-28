import { ArrayIsArray, ArrayPrototypeSome } from '../../primordials/array.mjs'
import { RegExpPrototypeTest } from '../../primordials/regexp.mjs'
import { ErrorCtor, TypeErrorCtor } from '../../primordials/error.mjs'
import { JSONParse } from '../../primordials/json.mjs'
import { ObjectHasOwn, ObjectValues } from '../../primordials/object.mjs'
import type { AttestationStatement, AttestationSubject } from '../types.mjs'

export function assertAttestationEnvelope(
  statement: unknown,
  predicateType: string,
): asserts statement is Record<string, unknown> & { subject: unknown[] } {
  if (
    !isAttestationRecord(statement) ||
    !ObjectHasOwn(statement, '_type') ||
    !ObjectHasOwn(statement, 'predicateType') ||
    !ObjectHasOwn(statement, 'subject') ||
    statement['_type'] !== 'https://in-toto.io/Statement/v1' ||
    statement['predicateType'] !== predicateType ||
    !ObjectHasOwn(statement, 'predicate') ||
    !ArrayIsArray(statement['subject'])
  ) {
    throw new ErrorCtor(
      'Attestation statement type or predicate type does not match',
    )
  }
}

export function assertAttestationExpectation(
  expected: AttestationSubject,
  predicateType: string,
): void {
  if (
    !expected ||
    typeof expected.name !== 'string' ||
    !expected.name ||
    typeof expected.digest?.sha256 !== 'string' ||
    !RegExpPrototypeTest(/^[a-f0-9]{64}$/, expected.digest.sha256) ||
    typeof predicateType !== 'string' ||
    !predicateType
  ) {
    throw new TypeErrorCtor(
      'Attestation requires a subject name, lowercase SHA-256 digest, and predicate type',
    )
  }
}

export function isAttestationRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !ArrayIsArray(value)
}

export function parseAttestationStatement(
  payload: string,
  expected: AttestationSubject,
  predicateType: string,
): AttestationStatement {
  assertAttestationExpectation(expected, predicateType)
  const statement: unknown = JSONParse(payload)
  assertAttestationEnvelope(statement, predicateType)
  let matches = 0
  for (const subject of statement['subject']) {
    if (
      !isAttestationRecord(subject) ||
      !ObjectHasOwn(subject, 'name') ||
      !ObjectHasOwn(subject, 'digest') ||
      typeof subject['name'] !== 'string' ||
      !isAttestationRecord(subject['digest']) ||
      ArrayPrototypeSome(
        ObjectValues(subject['digest']),
        value => typeof value !== 'string',
      )
    ) {
      throw new ErrorCtor('Attestation subject is malformed')
    }
    if (subject['name'] === expected.name) {
      matches += 1
      if (
        !ObjectHasOwn(subject['digest'], 'sha256') ||
        subject['digest']['sha256'] !== expected.digest.sha256
      ) {
        throw new ErrorCtor('Attestation subject digest does not match')
      }
    }
  }
  if (matches !== 1) {
    throw new ErrorCtor('Attestation must contain exactly one matching subject')
  }
  return statement as unknown as AttestationStatement
}
