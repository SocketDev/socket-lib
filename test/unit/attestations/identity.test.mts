import { readFileSync } from 'node:fs'
import { Verifier } from '@sigstore/verify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSigstoreCoreVerifier } from '../../../src/external/sigstore-verify.js'

const modernOid = '1.3.6.1.4.1.57264.1.8'
const legacyOid = '1.3.6.1.4.1.57264.1.1'
const issuer = 'https://issuer.example'
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

function derUtf8(value: string): Buffer {
  const bytes = Buffer.from(value)
  return Buffer.concat([Buffer.from([12, bytes.length]), bytes])
}

function readIssuer(
  claims: Array<ReturnType<typeof certificateOid>>,
): string | undefined {
  // Core verification is isolated here to exercise certificate claim decoding.
  // Real signatures and trust chains run in verify.test and the packed test.
  vi.spyOn(Verifier.prototype, 'verify').mockReturnValue({
    identity: { oids: claims },
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
