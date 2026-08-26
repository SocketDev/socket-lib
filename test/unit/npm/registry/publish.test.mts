/**
 * @file Unit tests for the npm registry publish, staging-mutation, OIDC,
 *   token, and trust endpoints. The HTTP adapter is injected, so every case
 *   runs with no network. Nothing here performs a real publish.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { exchangeOidcToken } from '../../../../src/npm/registry/oidc.mjs'
import { publishPackage } from '../../../../src/npm/registry/publish.mjs'
import {
  approveStagedVersion,
  deleteStagedVersion,
  stagePackageVersion,
} from '../../../../src/npm/registry/stage-actions.mjs'
import { fetchStagedItem } from '../../../../src/npm/registry/stage.mjs'
import {
  createNpmToken,
  deleteNpmToken,
  fetchNpmTokens,
} from '../../../../src/npm/registry/tokens.mjs'
import {
  addTrustedPublishers,
  deleteTrustedPublisher,
  fetchTrustedPublishers,
} from '../../../../src/npm/registry/trust.mjs'
import { failingHttp, recordingHttp } from './api-helpers.mjs'

const AUTH = { token: 'tok' }
const OTP_AUTH = { otp: '123456', token: 'tok' }
const STAGE_ID = '1de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f'

const PUBLISH_PAYLOAD = {
  _attachments: {
    'pkg-1.0.0.tgz': {
      content_type: 'application/octet-stream',
      data: 'ZXhhbXBsZQo=',
      length: 13,
    },
  },
  access: 'public' as const,
  name: '@example/pkg',
  versions: { '1.0.0': { name: '@example/pkg', version: '1.0.0' } },
}

describe('publishPackage', () => {
  test('PUTs the packument to the escaped package name', async () => {
    const stub = recordingHttp({ success: true })
    const result = await publishPackage(PUBLISH_PAYLOAD, { ...stub, ...AUTH })
    assert.equal(result.success, true)
    assert.equal(stub.calls[0]!.method, 'PUT')
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/@example%2Fpkg',
    )
  })

  test('takes the package name from the payload, so URL and body agree', async () => {
    // One source for the name means the URL can never publish to a different
    // package than the body describes.
    const stub = recordingHttp({ success: true })
    await publishPackage(PUBLISH_PAYLOAD, { ...stub, ...AUTH })
    assert.equal(JSON.parse(stub.calls[0]!.body!).name, '@example/pkg')
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/@example%2Fpkg',
    )
  })

  test('a rejected publish is reported, never thrown', async () => {
    const result = await publishPackage(PUBLISH_PAYLOAD, {
      ...failingHttp(409),
      ...AUTH,
    })
    assert.equal(result.success, false)
    assert.equal(result.success ? 0 : result.status, 409)
    assert.ok(!result.success && result.error.includes('Conflict'))
  })
})

describe('stagePackageVersion', () => {
  test('POSTs to /-/stage/package/{name} and returns the stage id', async () => {
    const stub = recordingHttp({ message: 'ok', stageId: STAGE_ID })
    const result = await stagePackageVersion(PUBLISH_PAYLOAD, {
      ...stub,
      ...AUTH,
    })
    assert.equal(result.success, true)
    assert.equal(result.success ? result.data.stageId : undefined, STAGE_ID)
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/stage/package/@example%2Fpkg',
    )
    assert.equal(stub.calls[0]!.method, 'POST')
  })
})

describe('fetchStagedItem', () => {
  test('reads one staged item by id', async () => {
    const stub = recordingHttp({
      id: STAGE_ID,
      packageName: '@example/pkg',
      shasum: '4f7f5f1d5bcf2f72f6e4d6c4f3b2812d8a2f6c19',
      version: '1.2.3',
    })
    const read = await fetchStagedItem(STAGE_ID, { ...stub, ...AUTH })
    assert.equal(read.reachable, true)
    assert.equal(read.item?.version, '1.2.3')
    assert.equal(
      stub.calls[0]!.url,
      `https://registry.npmjs.org/-/stage/${STAGE_ID}`,
    )
  })

  test('a 404 is reachable-with-no-item, not a failure', async () => {
    // npm answers 404 both for "no such stage id" and "not yours to see", so
    // neither is worth retrying.
    const read = await fetchStagedItem(STAGE_ID, {
      ...failingHttp(404),
      ...AUTH,
    })
    assert.equal(read.reachable, true)
    assert.equal(read.item, undefined)
  })

  test('a transport failure is unreachable', async () => {
    const read = await fetchStagedItem(STAGE_ID, { ...failingHttp(), ...AUTH })
    assert.equal(read.reachable, false)
  })
})

describe('deleteStagedVersion', () => {
  test('DELETEs the stage id and sends the OTP', async () => {
    const stub = recordingHttp()
    const result = await deleteStagedVersion(STAGE_ID, {
      ...stub,
      ...OTP_AUTH,
    })
    assert.equal(result.success, true)
    assert.equal(stub.calls[0]!.method, 'DELETE')
    assert.equal(stub.calls[0]!.headers?.['npm-otp'], '123456')
  })

  test('a missing-OTP 403 is reported', async () => {
    const result = await deleteStagedVersion(STAGE_ID, {
      ...failingHttp(403),
      ...AUTH,
    })
    assert.equal(result.success, false)
    assert.equal(result.success ? 0 : result.status, 403)
  })
})

describe('approveStagedVersion', () => {
  test('POSTs to the approve route', async () => {
    const stub = recordingHttp({ message: 'published' })
    const result = await approveStagedVersion(STAGE_ID, {
      ...stub,
      ...OTP_AUTH,
    })
    assert.equal(result.success, true)
    assert.equal(
      stub.calls[0]!.url,
      `https://registry.npmjs.org/-/stage/${STAGE_ID}/approve`,
    )
  })

  test('a failed approval never reads as a publish', async () => {
    // Approving IS publishing. A caller that cannot tell an approval from a
    // failed approval will either double-publish or claim a release shipped.
    const result = await approveStagedVersion(STAGE_ID, {
      ...failingHttp(409),
      ...AUTH,
    })
    assert.equal(result.success, false)
  })
})

describe('exchangeOidcToken', () => {
  test('POSTs to the package-scoped exchange route', async () => {
    const stub = recordingHttp({ token: 'npm_new', token_type: 'oidc' })
    const result = await exchangeOidcToken('@example/pkg', {
      ...stub,
      token: 'id-token',
    })
    assert.equal(result.success, true)
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@example%2Fpkg',
    )
    assert.equal(stub.calls[0]!.method, 'POST')
  })

  test('sends the id_token as the bearer credential', async () => {
    // This route wants the identity provider's id_token, not an npm token.
    const stub = recordingHttp({})
    await exchangeOidcToken('@example/pkg', { ...stub, token: 'id-token' })
    assert.equal(stub.calls[0]!.headers?.['authorization'], 'Bearer id-token')
  })

  test('a 401 is reported with the auth hint', async () => {
    const result = await exchangeOidcToken('@example/pkg', {
      ...failingHttp(401),
      token: 'id-token',
    })
    assert.equal(result.success, false)
    assert.ok(!result.success && result.error.includes('Authentication failed'))
  })
})

describe('createNpmToken', () => {
  test('maps camelCase params onto npm\u2019s snake_case wire names', async () => {
    const stub = recordingHttp({ key: 'abc', token: 'npm_secret' })
    await createNpmToken(
      {
        bypass2fa: true,
        name: 'ci',
        orgsPermission: 'read-only',
        packages: ['@example/pkg'],
        packagesAndScopesPermission: 'read-write',
        password: 'hunter2',
        tokenDescription: 'CI publisher',
      },
      { ...stub, ...OTP_AUTH },
    )
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      bypass_2fa: true,
      name: 'ci',
      orgs_permission: 'read-only',
      packages: ['@example/pkg'],
      packages_and_scopes_permission: 'read-write',
      password: 'hunter2',
      token_description: 'CI publisher',
    })
  })

  test('sends the OTP and the token command header', async () => {
    const stub = recordingHttp({})
    await createNpmToken(
      { name: 'ci', password: 'hunter2' },
      {
        ...stub,
        ...OTP_AUTH,
      },
    )
    assert.equal(stub.calls[0]!.headers?.['npm-otp'], '123456')
    assert.equal(stub.calls[0]!.headers?.['npm-command'], 'token')
  })

  test('omits every optional field that was not provided', async () => {
    const stub = recordingHttp({})
    await createNpmToken(
      { name: 'ci', password: 'hunter2' },
      {
        ...stub,
        ...OTP_AUTH,
      },
    )
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      name: 'ci',
      password: 'hunter2',
    })
  })

  test('a bypass-2FA 403 is reported with the reason', async () => {
    const result = await createNpmToken(
      { name: 'ci', password: 'hunter2' },
      {
        ...failingHttp(403),
        ...AUTH,
      },
    )
    assert.equal(result.success, false)
    assert.ok(!result.success && result.error.includes('bypass_2fa'))
  })
})

describe('fetchNpmTokens', () => {
  test('reads a page of tokens', async () => {
    const stub = recordingHttp({
      objects: [{ key: 'abc', token: 'npm_aBcD...7890' }],
      total: 1,
    })
    const read = await fetchNpmTokens({ ...stub, ...AUTH, perPage: 10 })
    assert.equal(read.reachable, true)
    assert.equal(read.total, 1)
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/npm/v1/tokens?perPage=10',
    )
  })

  test('an unreachable registry is NOT an empty token inventory', async () => {
    // A revocation sweep that reads this as "no tokens left" reports itself
    // finished having revoked nothing.
    const read = await fetchNpmTokens({ ...failingHttp(), ...AUTH })
    assert.equal(read.reachable, false)
    assert.deepEqual(read.objects, [])
  })
})

describe('deleteNpmToken', () => {
  test('DELETEs the identified token', async () => {
    const stub = recordingHttp()
    const result = await deleteNpmToken(
      '00000000-0000-0000-0000-000000000000',
      {
        ...stub,
        ...OTP_AUTH,
      },
    )
    assert.equal(result.success, true)
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/npm/v1/tokens/token/00000000-0000-0000-0000-000000000000',
    )
  })

  test('the token being deleted is separate from the one authenticating', async () => {
    const stub = recordingHttp()
    await deleteNpmToken('npm_target', { ...stub, token: 'npm_actor' })
    assert.ok(stub.calls[0]!.url.endsWith('/npm_target'))
    assert.equal(stub.calls[0]!.headers?.['authorization'], 'Bearer npm_actor')
  })
})

describe('fetchTrustedPublishers', () => {
  test('reads the configuration list', async () => {
    const stub = recordingHttp([
      {
        claims: { repository: 'example-org/example-pkg' },
        id: '00000000-0000-0000-0000-000000000000',
        permissions: ['createPackage'],
        type: 'github',
      },
    ])
    const read = await fetchTrustedPublishers('@example/pkg', {
      ...stub,
      ...OTP_AUTH,
    })
    assert.equal(read.reachable, true)
    assert.equal(read.configs[0]?.type, 'github')
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/package/@example%2Fpkg/trust',
    )
  })

  test('an empty array with reachable:true means nothing is trusted', async () => {
    const stub = recordingHttp([])
    const read = await fetchTrustedPublishers('@example/pkg', {
      ...stub,
      ...OTP_AUTH,
    })
    assert.equal(read.reachable, true)
    assert.deepEqual(read.configs, [])
  })

  test('an unreachable registry is NOT an empty trust list', async () => {
    // The trust list IS the set of identities allowed to publish.
    const read = await fetchTrustedPublishers('@example/pkg', {
      ...failingHttp(),
      ...OTP_AUTH,
    })
    assert.equal(read.reachable, false)
    assert.deepEqual(read.configs, [])
  })
})

describe('addTrustedPublishers', () => {
  test('sends an array body even for a single configuration', async () => {
    const stub = recordingHttp([])
    await addTrustedPublishers(
      '@example/pkg',
      [
        {
          claims: {
            environment: 'production',
            repository: 'example-org/example-pkg',
            workflow_ref: { file: 'publish.yml' },
          },
          permissions: ['createPackage', 'createStagedPackage'],
          type: 'github',
        },
      ],
      { ...stub, ...OTP_AUTH },
    )
    const body = JSON.parse(stub.calls[0]!.body!)
    assert.ok(Array.isArray(body))
    assert.equal(body[0].claims.workflow_ref.file, 'publish.yml')
    assert.equal(stub.calls[0]!.method, 'POST')
  })
})

describe('deleteTrustedPublisher', () => {
  test('DELETEs the configuration by id', async () => {
    const stub = recordingHttp()
    const result = await deleteTrustedPublisher(
      '@example/pkg',
      '00000000-0000-0000-0000-000000000000',
      { ...stub, ...OTP_AUTH },
    )
    assert.equal(result.success, true)
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/package/@example%2Fpkg/trust/00000000-0000-0000-0000-000000000000',
    )
  })
})
