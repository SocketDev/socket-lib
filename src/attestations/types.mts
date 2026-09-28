export type SigstoreEvidence = 'transparency-log' | 'timestamp-authority'

export interface SigstorePolicy {
  issuer: string
  identity: string
  certificateClaims?: Readonly<Record<string, string>> | undefined
  evidence: SigstoreEvidence
}

export interface SigstoreVerifierOptions {
  trustedRoot: unknown
  policy: SigstorePolicy
}

export interface AttestationSubject {
  name: string
  digest: { sha256: string }
}

export interface AttestationVerificationOptions {
  bundle: unknown
  subject: AttestationSubject
  predicateType: string
}

export interface AttestationStatement {
  _type: 'https://in-toto.io/Statement/v1'
  subject: Array<{ name: string; digest: Record<string, string> }>
  predicateType: string
  predicate: unknown
}

export interface VerifiedAttestation {
  statement: AttestationStatement
  signer: {
    identity: string
    issuer: string
    certificateClaims: Readonly<Record<string, string>>
  }
}

export interface SigstoreVerifier {
  verify(options: AttestationVerificationOptions): VerifiedAttestation
}
