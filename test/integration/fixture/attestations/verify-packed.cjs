const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function main() {
  const { 2: packagePath, 3: fixturePath } = process.argv
  const load = createRequire(path.join(packagePath, 'package.json'))
  assert.equal(
    load('@socketsecurity/lib/crypto/integrity').computeHash(
      Buffer.from('hello'),
      'sha256',
    ).hex,
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  )
  const isLoaded = () =>
    Object.keys(require.cache).some(name =>
      name.endsWith(path.join('external', 'sigstore-verify.js')),
    )
  assert.equal(isLoaded(), false)
  const { createSigstoreVerifier } = load(
    '@socketsecurity/lib/attestations/verify',
  )
  assert.equal(isLoaded(), false)
  const esm = await import(
    pathToFileURL(load.resolve('@socketsecurity/lib/attestations/verify')).href
  )
  assert.equal(esm.createSigstoreVerifier, createSigstoreVerifier)
  assert.equal(isLoaded(), false)
  const readFixture = name =>
    JSON.parse(readFileSync(path.join(fixturePath, name), 'utf8'))
  const cases = [
    {
      kind: 'private',
      evidence: 'timestamp-authority',
      identity:
        'https://github.com/actions/attest-demo/.github/workflows/build-python.yml@refs/heads/main',
      predicateType: 'https://slsa.dev/provenance/v1',
      name: 'github_provenance_demo-0.0.12-py3-none-any.whl',
      digest:
        'ae57936def59bc4c75edd3a837d89bcefc6d3a5e31d55a6fa7a71624f92c3c3b',
    },
    {
      kind: 'public',
      evidence: 'transparency-log',
      identity:
        'https://github.com/jdx/packslip/.github/workflows/release.yml@refs/tags/v1.4.0',
      predicateType: 'https://packslip.dev/release/v1',
      name: 'packslip-v1.4.0-darwin-arm64.tar.xz',
      digest:
        '8508708ffa43a8883393305230a5d81f42699b18fbfb059458ebf27c8efbc97c',
    },
  ]
  for (let index = 0, { length } = cases; index < length; index += 1) {
    const fixture = cases[index]
    const verifier = await createSigstoreVerifier({
      trustedRoot: readFixture(`${fixture.kind}-root.json`),
      policy: {
        issuer: 'https://token.actions.githubusercontent.com',
        identity: fixture.identity,
        evidence: fixture.evidence,
      },
    })
    const input = {
      bundle: readFixture(`${fixture.kind}-bundle.json`),
      predicateType: fixture.predicateType,
      subject: { name: fixture.name, digest: { sha256: fixture.digest } },
    }
    assert.equal(verifier.verify(input).signer.identity, fixture.identity)
    input.subject.digest.sha256 = '0'.repeat(64)
    assert.throws(() => verifier.verify(input), /digest/)
  }
  assert.equal(isLoaded(), true)
  process.stdout.write(
    JSON.stringify({
      verified: cases.length,
      lazy: true,
      network: process.permission.has('net'),
    }),
  )
}
main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
