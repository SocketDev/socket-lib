import { getNodeVersion } from '../constants/node.mjs'
import { JSONParse, JSONStringify } from '../primordials/json.mjs'
import { ErrorCtor, TypeErrorCtor } from '../primordials/error.mjs'
import { ObjectFreeze } from '../primordials/object.mjs'
import {
  assertSigstoreRuntime,
  snapshotSigstorePolicy,
} from './_internal/policy.mjs'
import { parseAttestationStatement } from './_internal/statement.mjs'
import type { SigstoreVerifier, SigstoreVerifierOptions } from './types.mjs'

export async function createSigstoreVerifier(
  options: SigstoreVerifierOptions,
): Promise<SigstoreVerifier> {
  const opts = { __proto__: null, ...options } as typeof options
  assertSigstoreRuntime(getNodeVersion())
  const { issuer, identity, evidence, certificateClaims, requiredClaims } =
    snapshotSigstorePolicy(opts.policy)
  const trustedRootJson = JSONStringify(opts.trustedRoot)
  if (typeof trustedRootJson !== 'string') {
    throw new TypeErrorCtor('Sigstore requires caller-supplied trust root JSON')
  }
  const trustedRoot: unknown = JSONParse(trustedRootJson)
  const { createSigstoreCoreVerifier } =
    await import('../external/sigstore-verify.js')
  const verifyCore = createSigstoreCoreVerifier(trustedRoot, evidence)
  return ObjectFreeze({
    verify({ bundle, subject, predicateType }) {
      const authenticated = verifyCore(bundle, requiredClaims)
      if (
        authenticated.identity !== identity ||
        authenticated.issuer !== issuer
      ) {
        throw new ErrorCtor(
          'Attestation signer does not match the required identity and issuer',
        )
      }
      for (const [oid, value] of certificateClaims) {
        if (authenticated.certificateClaims[oid] !== value) {
          throw new ErrorCtor(
            `Attestation certificate claim does not match: ${oid}`,
          )
        }
      }
      if (authenticated.payloadType !== 'application/vnd.in-toto+json') {
        throw new ErrorCtor('Attestation payload must be an in-toto statement')
      }
      const statement = parseAttestationStatement(
        authenticated.payload,
        subject,
        predicateType,
      )
      return {
        __proto__: null,
        statement,
        signer: {
          __proto__: null,
          identity,
          issuer,
          certificateClaims: ObjectFreeze(authenticated.certificateClaims),
        },
      }
    },
  } satisfies SigstoreVerifier)
}
