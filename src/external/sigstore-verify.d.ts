export function createSigstoreCoreVerifier(
  trustedRoot: unknown,
  evidence: 'transparency-log' | 'timestamp-authority',
): (
  bundle: unknown,
  requiredClaims: readonly string[],
) => {
  identity: string | undefined
  issuer: string | undefined
  certificateClaims: Record<string, string>
  payloadType: string
  payload: string
}
