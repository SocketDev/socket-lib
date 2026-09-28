import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as nodeConstants from '../../../src/constants/node.mts'
import { createSigstoreVerifier } from '../../../src/attestations/verify.mts'
import type { SigstoreVerifierOptions } from '../../../src/attestations/types.mts'

const publicBundle = JSON.parse(
  readFileSync(
    new URL('./fixtures/public-bundle.json', import.meta.url),
    'utf8',
  ),
)
const publicRoot = JSON.parse(
  readFileSync(new URL('./fixtures/public-root.json', import.meta.url), 'utf8'),
)
const privateBundle = JSON.parse(
  readFileSync(
    new URL('./fixtures/private-bundle.json', import.meta.url),
    'utf8',
  ),
)
const privateRoot = JSON.parse(
  readFileSync(
    new URL('./fixtures/private-root.json', import.meta.url),
    'utf8',
  ),
)
const repositoryIdOid = '1.3.6.1.4.1.57264.1.15'
const publicOptions: SigstoreVerifierOptions = {
  policy: {
    issuer: 'https://token.actions.githubusercontent.com',
    identity:
      'https://github.com/jdx/packslip/.github/workflows/release.yml@refs/tags/v1.4.0',
    certificateClaims: { [repositoryIdOid]: '1356006409' },
    evidence: 'transparency-log',
  },
  trustedRoot: publicRoot,
}
const privateOptions: SigstoreVerifierOptions = {
  policy: {
    issuer: 'https://token.actions.githubusercontent.com',
    identity:
      'https://github.com/actions/attest-demo/.github/workflows/build-python.yml@refs/heads/main',
    evidence: 'timestamp-authority',
  },
  trustedRoot: privateRoot,
}
const publicSubject = {
  digest: {
    sha256: '8508708ffa43a8883393305230a5d81f42699b18fbfb059458ebf27c8efbc97c',
  },
  name: 'packslip-v1.4.0-darwin-arm64.tar.xz',
}
const privateSubject = {
  digest: {
    sha256: 'ae57936def59bc4c75edd3a837d89bcefc6d3a5e31d55a6fa7a71624f92c3c3b',
  },
  name: 'github_provenance_demo-0.0.12-py3-none-any.whl',
}
const publicInput = {
  bundle: publicBundle,
  predicateType: 'https://packslip.dev/release/v1',
  subject: publicSubject,
}
const privateInput = {
  bundle: privateBundle,
  predicateType: 'https://slsa.dev/provenance/v1',
  subject: privateSubject,
}

afterEach(() => vi.restoreAllMocks())

describe('Sigstore attestations', () => {
  it.each(['v24.14.9', 'v25.5.0', 'v22.22.2'])(
    'rejects unsupported Node %s before verifier loading',
    async version => {
      vi.spyOn(nodeConstants, 'getNodeVersion').mockReturnValue(version)
      await expect(createSigstoreVerifier(publicOptions)).rejects.toThrow(
        'requires Node',
      )
    },
  )

  it.each(['v24.15.0', 'v26.0.0'])(
    'accepts supported Node %s',
    async version => {
      vi.spyOn(nodeConstants, 'getNodeVersion').mockReturnValue(version)
      const verifier = await createSigstoreVerifier(publicOptions)
      expect(verifier.verify(publicInput).signer.identity).toBe(
        publicOptions.policy.identity,
      )
    },
  )

  it('authenticates public identity, repository claims, and subject without network', async () => {
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected network'))
    const verifier = await createSigstoreVerifier(publicOptions)
    const result = verifier.verify(publicInput)
    expect(result.signer).toEqual({
      identity: publicOptions.policy.identity,
      issuer: publicOptions.policy.issuer,
      certificateClaims: { [repositoryIdOid]: '1356006409' },
    })
    expect(result.statement.predicateType).toBe(publicInput.predicateType)
    expect(result.statement.predicate).toMatchObject({
      project: 'packslip.dev',
      version: '1.4.0',
    })
    expect(network).not.toHaveBeenCalled()
  })

  it('verifies private RFC3161 evidence offline', async () => {
    const verifier = await createSigstoreVerifier(privateOptions)
    const result = verifier.verify(privateInput)
    expect(result.signer.identity).toBe(privateOptions.policy.identity)
    expect(result.statement.subject).toContainEqual(privateSubject)
  })

  it('reuses parsed roots without caching verification results or mutable policy', async () => {
    const options = JSON.parse(
      JSON.stringify(publicOptions),
    ) as typeof publicOptions
    const pending = createSigstoreVerifier(options)
    options.policy.identity = 'changed'
    ;(options.policy.certificateClaims as Record<string, string>)[
      repositoryIdOid
    ] = 'changed'
    options.policy.certificateClaims = {}
    ;(
      options.trustedRoot as { certificateAuthorities: unknown[] }
    ).certificateAuthorities = []
    const verifier = await pending
    const first = verifier.verify(publicInput)
    first.statement.predicate = { changed: true }
    expect(verifier.verify(publicInput).statement.predicate).toMatchObject({
      project: 'packslip.dev',
    })
    const changed = JSON.parse(
      JSON.stringify(publicBundle),
    ) as typeof publicBundle
    changed.dsseEnvelope.payload = Buffer.from('{}').toString('base64')
    expect(() => verifier.verify({ ...publicInput, bundle: changed })).toThrow()
  })

  it.each(['identity', 'issuer'] as const)(
    'rejects a wrong literal %s',
    async field => {
      const options = JSON.parse(
        JSON.stringify(publicOptions),
      ) as typeof publicOptions
      options.policy[field] = '.*'
      const verifier = await createSigstoreVerifier(options)
      expect(() => verifier.verify(publicInput)).toThrow('signer')
    },
  )

  it('rejects a wrong or missing required certificate claim', async () => {
    for (const claims of [
      { [repositoryIdOid]: '42' },
      { '1.2.3.4': 'missing' },
    ]) {
      const verifier = await createSigstoreVerifier({
        ...publicOptions,
        policy: { ...publicOptions.policy, certificateClaims: claims },
      })
      expect(() => verifier.verify(publicInput)).toThrow('claim')
    }
  })

  it('rejects an unrelated trust root', async () => {
    const verifier = await createSigstoreVerifier({
      ...publicOptions,
      trustedRoot: privateRoot,
    })
    expect(() => verifier.verify(publicInput)).toThrow()
  })

  it('rejects wrong subjects, digests, predicate types and malformed expected digests', async () => {
    const verifier = await createSigstoreVerifier(publicOptions)
    expect(() =>
      verifier.verify({
        ...publicInput,
        subject: { ...publicSubject, name: 'other' },
      }),
    ).toThrow('subject')
    expect(() =>
      verifier.verify({
        ...publicInput,
        subject: { ...publicSubject, digest: { sha256: '0'.repeat(64) } },
      }),
    ).toThrow('digest')
    expect(() =>
      verifier.verify({
        ...publicInput,
        subject: { ...publicSubject, digest: { sha256: 'invalid' } },
      }),
    ).toThrow('SHA-256')
    expect(() =>
      verifier.verify({
        ...publicInput,
        predicateType: 'https://example.com/other/v1',
      }),
    ).toThrow('predicate')
  })

  it.each(['payload', 'signature', 'payloadType'] as const)(
    'rejects a tampered %s',
    async target => {
      const changed = JSON.parse(
        JSON.stringify(publicBundle),
      ) as typeof publicBundle
      if (target === 'payload') {
        changed.dsseEnvelope.payload = Buffer.from('{}').toString('base64')
      } else if (target === 'payloadType') {
        changed.dsseEnvelope.payloadType = 'application/json'
      } else {
        changed.dsseEnvelope.signatures[0].sig = Buffer.alloc(72, 3).toString(
          'base64',
        )
      }
      const verifier = await createSigstoreVerifier(publicOptions)
      expect(() =>
        verifier.verify({ ...publicInput, bundle: changed }),
      ).toThrow()
    },
  )

  it('requires public log evidence and validates checkpoint signatures', async () => {
    const verifier = await createSigstoreVerifier(publicOptions)
    const missing = JSON.parse(
      JSON.stringify(publicBundle),
    ) as typeof publicBundle
    missing.verificationMaterial.tlogEntries = []
    expect(() => verifier.verify({ ...publicInput, bundle: missing })).toThrow()
    const changed = JSON.parse(
      JSON.stringify(publicBundle),
    ) as typeof publicBundle
    const checkpoint =
      changed.verificationMaterial.tlogEntries[0].inclusionProof.checkpoint
    const lines = checkpoint.envelope.split(/\r?\n/)
    lines[2] = Buffer.alloc(32, 7).toString('base64')
    checkpoint.envelope = lines.join('\n')
    expect(() => verifier.verify({ ...publicInput, bundle: changed })).toThrow()
  })

  it.each(['transparency-log', 'timestamp-authority'] as const)(
    'rejects corrupt TSA with valid log evidence in %s mode',
    async evidence => {
      const verifier = await createSigstoreVerifier({
        ...publicOptions,
        policy: { ...publicOptions.policy, evidence },
      })
      const changed = JSON.parse(
        JSON.stringify(publicBundle),
      ) as typeof publicBundle
      changed.verificationMaterial.timestampVerificationData.rfc3161Timestamps[0].signedTimestamp =
        Buffer.from('tampered').toString('base64')
      expect(() =>
        verifier.verify({ ...publicInput, bundle: changed }),
      ).toThrow()
    },
  )

  it('requires RFC3161 evidence and rejects timestamp tampering', async () => {
    const verifier = await createSigstoreVerifier(privateOptions)
    const missing = JSON.parse(
      JSON.stringify(privateBundle),
    ) as typeof privateBundle
    delete missing.verificationMaterial.timestampVerificationData
    expect(() =>
      verifier.verify({ ...privateInput, bundle: missing }),
    ).toThrow()
    const changed = JSON.parse(
      JSON.stringify(privateBundle),
    ) as typeof privateBundle
    changed.verificationMaterial.timestampVerificationData.rfc3161Timestamps[0].signedTimestamp =
      Buffer.from('tampered').toString('base64')
    expect(() =>
      verifier.verify({ ...privateInput, bundle: changed }),
    ).toThrow()
  })

  it('does not substitute public log timestamps for timestamp-authority policy', async () => {
    const verifier = await createSigstoreVerifier({
      ...publicOptions,
      policy: { ...publicOptions.policy, evidence: 'timestamp-authority' },
    })
    const noTsa = JSON.parse(
      JSON.stringify(publicBundle),
    ) as typeof publicBundle
    delete noTsa.verificationMaterial.timestampVerificationData
    expect(() => verifier.verify({ ...publicInput, bundle: noTsa })).toThrow(
      'timestamp authority',
    )
  })

  it('requires explicit evidence and literal policy values', async () => {
    await expect(
      createSigstoreVerifier({ ...publicOptions, trustedRoot: undefined }),
    ).rejects.toThrow('trust root JSON')
    await expect(
      createSigstoreVerifier({
        ...publicOptions,
        policy: { ...publicOptions.policy, identity: '' },
      }),
    ).rejects.toThrow('literal')
    await expect(
      createSigstoreVerifier({
        ...publicOptions,
        policy: { ...publicOptions.policy, evidence: undefined },
      } as unknown as SigstoreVerifierOptions),
    ).rejects.toThrow('evidence')
    await expect(
      createSigstoreVerifier({
        ...publicOptions,
        policy: {
          ...publicOptions.policy,
          certificateClaims: { invalid: 'claim' },
        },
      }),
    ).rejects.toThrow('OIDs')
  })
})
