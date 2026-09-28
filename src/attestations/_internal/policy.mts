import { ArrayPrototypeMap } from '../../primordials/array.mjs'
import { ErrorCtor, TypeErrorCtor } from '../../primordials/error.mjs'
import { NumberCtor } from '../../primordials/number.mjs'
import { ObjectEntries } from '../../primordials/object.mjs'
import { RegExpPrototypeTest } from '../../primordials/regexp.mjs'
import {
  StringPrototypeSlice,
  StringPrototypeSplit,
} from '../../primordials/string.mjs'
import type { SigstorePolicy } from '../types.mjs'

export function assertSigstoreRuntime(version: string): void {
  const { 0: major, 1: minor } = ArrayPrototypeMap(
    StringPrototypeSplit(StringPrototypeSlice(version, 1), '.'),
    NumberCtor,
  )
  if (!(major! >= 26 || (major === 24 && minor! >= 15))) {
    throw new ErrorCtor(
      'Sigstore verification requires Node ^24.15.0 or >=26.0.0',
    )
  }
}

export function snapshotSigstorePolicy(policy: SigstorePolicy) {
  const { issuer, identity, evidence } = policy
  if (
    !issuer ||
    typeof issuer !== 'string' ||
    !identity ||
    typeof identity !== 'string'
  ) {
    throw new TypeErrorCtor(
      'Sigstore policy requires a literal issuer and identity',
    )
  }
  if (evidence !== 'timestamp-authority' && evidence !== 'transparency-log') {
    throw new TypeErrorCtor(
      'Sigstore policy requires timestamp-authority or transparency-log evidence',
    )
  }
  const certificateClaims = ObjectEntries(policy.certificateClaims ?? {})
  for (const [oid, value] of certificateClaims) {
    // OIDs begin with 0, 1, or 2, followed by dot-separated decimal arcs.
    if (
      !RegExpPrototypeTest(/^[0-2](?:\.(?:0|[1-9][0-9]*))+$/, oid) ||
      typeof value !== 'string' ||
      !value
    ) {
      throw new TypeErrorCtor(
        'Sigstore certificate claims require OIDs and nonempty strings',
      )
    }
  }
  return {
    __proto__: null,
    issuer,
    identity,
    evidence,
    certificateClaims,
    requiredClaims: ArrayPrototypeMap(certificateClaims, ([oid]) => oid),
  }
}
