/**
 * @file Unit tests for the npm access-token endpoints. The HTTP adapter is the
 *   in-memory double from `./api-helpers`, so every case runs with no network.
 *   The cases here pin the wire shape of the optional fields: npm reads them
 *   under snake_case names, and an omitted one must be absent rather than sent
 *   as an explicit null.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  createNpmToken,
  fetchNpmTokens,
} from '../../../../../src/eco/npm/registry/tokens.mjs'
import { recordingHttp } from './api-helpers.mjs'

const AUTH = { token: 'tok' }

describe('createNpmToken optional fields', () => {
  test('every optional param reaches the wire under its snake_case name', async () => {
    const stub = recordingHttp({ token: 'npm_xxx' })
    await createNpmToken(
      {
        bypass2fa: true,
        cidr: ['10.0.0.0/8'],
        expires: 30,
        name: 'ci-token',
        orgs: ['example-org'],
        orgsPermission: 'read-only',
        packages: ['example-pkg'],
        packagesAndScopesPermission: 'read-write',
        password: 'hunter2',
        scopes: ['@example'],
        tokenDescription: 'used by CI',
      },
      { ...stub, ...AUTH },
    )
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      bypass_2fa: true,
      cidr: ['10.0.0.0/8'],
      expires: 30,
      name: 'ci-token',
      orgs: ['example-org'],
      orgs_permission: 'read-only',
      packages: ['example-pkg'],
      packages_and_scopes_permission: 'read-write',
      password: 'hunter2',
      scopes: ['@example'],
      token_description: 'used by CI',
    })
  })

  test('omitted optional params are absent, not sent as null', async () => {
    const stub = recordingHttp({ token: 'npm_xxx' })
    await createNpmToken(
      { name: 'bare', password: 'hunter2' },
      { ...stub, ...AUTH },
    )
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      name: 'bare',
      password: 'hunter2',
    })
  })
})

describe('fetchNpmTokens', () => {
  test('a non-array objects field yields no tokens but stays reachable', async () => {
    const stub = recordingHttp({ objects: 'not-an-array', total: 0 })
    const read = await fetchNpmTokens({ ...stub, ...AUTH })
    assert.deepEqual(read.objects, [])
    assert.equal(read.reachable, true)
  })
})
