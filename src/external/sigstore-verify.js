"use strict";

const { ASN1Obj } = require('@sigstore/core')
const { bundleFromJSON } = require('@sigstore/bundle')
const { TrustedRoot } = require('@sigstore/protobuf-specs')
const { Verifier, toSignedEntity, toTrustMaterial } = require('@sigstore/verify')

function createSigstoreCoreVerifier(trustedRoot, evidence) {
  const trust = toTrustMaterial(TrustedRoot.fromJSON(trustedRoot))
  const verifier = new Verifier(trust, {
    ctlogThreshold: evidence === 'transparency-log' ? 1 : 0,
    tlogThreshold: evidence === 'transparency-log' ? 1 : 0,
    timestampThreshold: 1,
  })
  return function verifySigstoreBundle(raw, requiredClaims) {
    const bundle = bundleFromJSON(raw)
    if (bundle.content.$case !== 'dsseEnvelope') {
      throw new Error('Attestation requires a DSSE envelope')
    }
    const entity = toSignedEntity(bundle)
    if (entity.key.$case !== 'certificate') {
      throw new Error('Attestation requires a certificate identity')
    }
    if (evidence === 'timestamp-authority') {
      entity.timestamps = entity.timestamps.filter(item => item.$case === 'timestamp-authority')
      if (entity.timestamps.length === 0) {
        throw new Error('Attestation requires a timestamp authority')
      }
    }
    const signer = verifier.verify(entity)
    const oids = signer.identity?.oids ?? []
    const issuer = readCertificateIssuer(oids)
    const claims = Object.create(null)
    for (const oid of requiredClaims) {
      claims[oid] = readCertificateClaim(oids, oid, true)
    }
    return {
      identity: signer.identity?.subjectAlternativeName,
      issuer,
      certificateClaims: claims,
      payloadType: bundle.content.dsseEnvelope.payloadType,
      payload: new TextDecoder('utf-8', { fatal: true }).decode(bundle.content.dsseEnvelope.payload),
    }
  }
}

function readCertificateClaim(oids, oid, der) {
  const matches = oids.filter(item => item.oid?.id.join('.') === oid)
  if (matches.length !== 1) throw new Error(`Attestation certificate claim missing or duplicated: ${oid}`)
  const rawValue = matches[0].value
  let value = rawValue
  if (der) {
    const claim = ASN1Obj.parseBuffer(rawValue)
    if (!claim.tag.isUniversal() || claim.tag.constructed || claim.tag.number !== 12 ||
        !claim.toDER().equals(rawValue)) {
      throw new Error(`Attestation certificate claim is not a DER UTF8String: ${oid}`)
    }
    value = claim.value
  }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value)
}

function readCertificateIssuer(oids) {
  const modernOid = '1.3.6.1.4.1.57264.1.8'
  const legacyOid = '1.3.6.1.4.1.57264.1.1'
  const hasModern = oids.some(item => item.oid?.id.join('.') === modernOid)
  const hasLegacy = oids.some(item => item.oid?.id.join('.') === legacyOid)
  const modern = hasModern ? readCertificateClaim(oids, modernOid, true) : undefined
  const legacy = hasLegacy ? readCertificateClaim(oids, legacyOid, false) : undefined
  if (modern !== undefined && legacy !== undefined && modern !== legacy) {
    throw new Error('Attestation certificate issuer claims disagree')
  }
  const issuer = modern ?? legacy
  if (!issuer) throw new Error('Attestation certificate issuer is missing')
  return issuer
}

exports.createSigstoreCoreVerifier = createSigstoreCoreVerifier
