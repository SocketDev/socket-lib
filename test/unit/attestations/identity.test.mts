import { readFileSync } from 'node:fs'
import { Verifier } from '@sigstore/verify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSigstoreCoreVerifier } from '../../../src/external/sigstore-verify.js'

const modernOid = '1.3.6.1.4.1.57264.1.8'
const legacyOid = '1.3.6.1.4.1.57264.1.1'
const issuer = 'https://issuer.example'
const identity = 'https://identity.example'
const sanOid = '2.5.29.17'
const root = JSON.parse(
  readFileSync(new URL('./fixtures/public-root.json', import.meta.url), 'utf8'),
)
const bundle = JSON.parse(
  readFileSync(
    new URL('./fixtures/public-bundle.json', import.meta.url),
    'utf8',
  ),
)

function certificateOid(oid: string, value: Buffer) {
  return { oid: { id: oid.split('.').map(Number) }, value }
}

function derSan(value: string, tag = 0x86): Buffer {
  const bytes = Buffer.from(value)
  return Buffer.concat([
    Buffer.from([0x30, bytes.length + 2, tag, bytes.length]),
    bytes,
  ])
}

function derUtf8(value: string): Buffer {
  const bytes = Buffer.from(value)
  return Buffer.concat([Buffer.from([12, bytes.length]), bytes])
}

function readIdentity(
  claims: Array<ReturnType<typeof certificateOid>>,
): string | undefined {
  vi.spyOn(Verifier.prototype, 'verify').mockReturnValue({
    identity: { oids: [certificateOid(modernOid, derUtf8(issuer)), ...claims] },
  } as ReturnType<Verifier['verify']>)
  return createSigstoreCoreVerifier(root, 'transparency-log')(bundle, [])
    .identity
}

function readIssuer(
  claims: Array<ReturnType<typeof certificateOid>>,
): string | undefined {
  // Core verification is isolated here to exercise certificate claim decoding.
  // Real signatures and trust chains run in verify.test and the packed test.
  vi.spyOn(Verifier.prototype, 'verify').mockReturnValue({
    identity: { oids: [...claims, certificateOid(sanOid, derSan(identity))] },
  } as ReturnType<Verifier['verify']>)
  return createSigstoreCoreVerifier(root, 'transparency-log')(bundle, []).issuer
}

afterEach(() => vi.restoreAllMocks())

describe('authenticated issuer claim decoding', () => {
  it.each(['https://issuer.example/é', '\uFEFFhttps://issuer.example'])(
    'preserves the literal issuer %s without normalization',
    unicodeIssuer => {
      expect(
        readIssuer([certificateOid(modernOid, derUtf8(unicodeIssuer))]),
      ).toBe(unicodeIssuer)
    },
  )

  it('accepts legacy raw UTF-8 issuer values', () => {
    expect(readIssuer([certificateOid(legacyOid, Buffer.from(issuer))])).toBe(
      issuer,
    )
  })

  it('accepts matching modern and legacy issuer claims', () => {
    expect(
      readIssuer([
        certificateOid(modernOid, derUtf8(issuer)),
        certificateOid(legacyOid, Buffer.from(issuer)),
      ]),
    ).toBe(issuer)
  })

  it.each([
    [],
    [
      certificateOid(modernOid, derUtf8(issuer)),
      certificateOid(modernOid, derUtf8(issuer)),
    ],
    [
      certificateOid(legacyOid, Buffer.from(issuer)),
      certificateOid(legacyOid, Buffer.from(issuer)),
    ],
    [
      certificateOid(modernOid, derUtf8(issuer)),
      certificateOid(legacyOid, Buffer.from('https://other.example')),
    ],
    [certificateOid(modernOid, Buffer.from([12, 1, 0xff]))],
    [certificateOid(legacyOid, Buffer.from([0xff]))],
    [certificateOid(modernOid, Buffer.from([19, 1, 0x61]))],
    [
      certificateOid(
        modernOid,
        Buffer.concat([derUtf8(issuer), Buffer.from([0])]),
      ),
    ],
    [certificateOid(modernOid, derUtf8(''))],
  ])('rejects malformed or ambiguous issuer claims %#', claims => {
    expect(() => readIssuer(claims)).toThrow()
  })
})

describe('authenticated SAN decoding', () => {
  it.each([0x81, 0x86])('accepts one ASCII SAN with tag %s', tag => {
    expect(readIdentity([certificateOid(sanOid, derSan(identity, tag))])).toBe(
      identity,
    )
  })
  it.each([
    [],
    [
      certificateOid(sanOid, derSan(identity)),
      certificateOid(sanOid, derSan(identity)),
    ],
    [certificateOid(sanOid, Buffer.from([0x30, 3, 0x86, 1, 0xff]))],
    [
      certificateOid(
        sanOid,
        Buffer.from([0x30, 6, 0x86, 1, 0x61, 0x81, 1, 0x62]),
      ),
    ],
    [certificateOid(sanOid, derSan(''))],
    [certificateOid(sanOid, derUtf8(identity))],
    [
      certificateOid(
        sanOid,
        Buffer.concat([derSan(identity), Buffer.from([0])]),
      ),
    ],
    [certificateOid(sanOid, derSan(identity, 0x82))],
  ])('rejects missing, ambiguous, or malformed SAN encodings %#', claims => {
    expect(() => readIdentity(claims)).toThrow()
  })
})
