# Verify Sigstore attestations

Import `createSigstoreVerifier` from `@socketsecurity/lib/attestations/verify`.
The verifier checks a Sigstore DSSE bundle against a caller-supplied trust root and policy.
It returns the authenticated in-toto v1 statement and certificate identity.

```ts
import { createSigstoreVerifier } from '@socketsecurity/lib/attestations/verify'
import { computeHash } from '@socketsecurity/lib/crypto/integrity'

const verifier = await createSigstoreVerifier({
  trustedRoot,
  policy: {
    issuer: 'https://token.actions.githubusercontent.com',
    identity:
      'https://github.com/example/project/.github/workflows/release.yml@refs/heads/main',
    certificateClaims: { '1.3.6.1.4.1.57264.1.15': '123456' },
    evidence: 'timestamp-authority',
  },
})

const result = verifier.verify({
  bundle,
  predicateType: 'https://example.com/release/v1',
  subject: {
    name: 'release.tar.gz',
    digest: { sha256: computeHash(archiveBytes, 'sha256').hex },
  },
})
```

Get `trustedRoot` from an authenticated source independent of the bundle.
The library does not fetch roots or make network requests.
The caller owns root updates, revocation policy, artifact downloads, and freshness requirements.
A valid signature can authenticate an older artifact.
Validate the returned `predicate` against the application's schema and expected release metadata before using the artifact.

The policy compares the issuer and certificate SAN as literal strings.
It compares required certificate extension OIDs as DER UTF8String values.
The result includes the verified required claims.
Names and SHA-256 digests match exactly, and the expected subject must occur once.
Other subjects may occur in the statement.

`transparency-log` requires a valid log entry, certificate transparency evidence, and an authenticated timestamp.
`timestamp-authority` requires a valid RFC3161 timestamp.
A log timestamp cannot replace the required RFC3161 timestamp.
Both modes reject invalid evidence supplied in the bundle.
Neither mode accepts signatures identified only by a public key.

Reuse the context to parse trust material once per process.
Every `verify` call authenticates the supplied bundle again.
The context does not cache successful verification results.
It does not return a signing time because the verification library does not expose an authenticated time.

This leaf requires Node 24.15.0 or later in the Node 24 series, or Node 26 and later.
The factory loads the bundled verifier after checking the runtime.
Importing other leaves does not load Sigstore.
