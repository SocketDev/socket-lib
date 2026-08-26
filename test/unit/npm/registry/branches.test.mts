/**
 * @file Branch-arm coverage for the npm registry client. Each test here exists
 *   to exercise one conditional arm the behavior-focused suites leave
 *   unvisited.
 *
 *   - an optional field that is only ever set, a defensive `Array.isArray`
 *     fallback whose false side never fires on well-formed input, a nullish
 *     default that every other caller supplies. Kept in one file, separate from
 *     the per-module suites, so those stay readable as descriptions of behavior
 *     rather than as inventories of every optional parameter. No network: every
 *     adapter is the in-memory double from `./api-helpers`.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { setPackageAccess } from '../../../../src/npm/registry/access.mjs'
import {
  buildAdvisoryQueryKey,
  fetchBulkAdvisories,
} from '../../../../src/npm/registry/audit.mjs'
import { nextSearchFrom } from '../../../../src/npm/registry/search.mjs'
import { fetchStagedVersions } from '../../../../src/npm/registry/stage.mjs'
import {
  createNpmToken,
  fetchNpmTokens,
} from '../../../../src/npm/registry/tokens.mjs'
import { fetchTrustedPublishers } from '../../../../src/npm/registry/trust.mjs'
import { PackumentNotFoundError } from '../../../../src/npm/meta-cache/node.mjs'
import { extractHttpStatus } from '../../../../src/npm/meta/node.mjs'
import { makeHttpResponseError } from '../meta-test-helpers.mjs'
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

describe('setPackageAccess optional fields', () => {
  test('an empty params bag sends an empty body rather than nulls', async () => {
    const stub = recordingHttp({})
    await setPackageAccess('example-pkg', {}, { ...stub, ...AUTH })
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {})
  })
})

describe('fetchTrustedPublishers', () => {
  test('a non-array body yields no configs but stays reachable', async () => {
    // The route is documented to answer an array. Anything else is a shape we
    // cannot read, which is different from a registry we could not reach.
    const stub = recordingHttp({ unexpected: 'object' })
    const read = await fetchTrustedPublishers('example-pkg', {
      ...stub,
      ...AUTH,
    })
    assert.deepEqual(read.configs, [])
    assert.equal(read.reachable, true)
  })
})

describe('fetchStagedVersions', () => {
  test('a non-array items field yields no items but stays reachable', async () => {
    const stub = recordingHttp({ items: 'not-an-array', total: 0 })
    const read = await fetchStagedVersions({ ...stub, ...AUTH })
    assert.deepEqual(read.items, [])
    assert.equal(read.reachable, true)
  })
})

describe('buildAdvisoryQueryKey', () => {
  test('a name with no versions contributes an empty version list', async () => {
    const key = buildAdvisoryQueryKey({
      'example-pkg': undefined as unknown as string[],
    })
    assert.equal(key, 'example-pkg@')
  })

  test('names and versions are both sorted so callers share one key', () => {
    assert.equal(
      buildAdvisoryQueryKey({ beta: ['2.0.0', '1.0.0'], alpha: ['1.0.0'] }),
      'alpha@1.0.0;beta@1.0.0,2.0.0',
    )
  })
})

describe('fetchBulkAdvisories', () => {
  test('a non-object body yields no advisories but stays reachable', async () => {
    const stub = recordingHttp('not-an-object')
    const read = await fetchBulkAdvisories(
      { 'example-pkg': ['1.0.0'] },
      { ...stub },
    )
    assert.deepEqual(read.advisories, {})
    assert.equal(read.reachable, true)
  })

  test('a null body yields no advisories but stays reachable', async () => {
    // Parsed rather than written as a literal: a real adapter hands back the
    // result of JSON.parse, and a bare `null` body is what produces it.
    const stub = recordingHttp(JSON.parse('null'))
    const read = await fetchBulkAdvisories(
      { 'example-pkg': ['1.0.0'] },
      { ...stub },
    )
    assert.deepEqual(read.advisories, {})
    assert.equal(read.reachable, true)
  })
})

describe('nextSearchFrom', () => {
  test('an explicit from offset is advanced by the page length', () => {
    const next = nextSearchFrom(
      { from: 20, text: 'example' },
      { objects: [{}, {}] as never[], reachable: true, total: 100 },
    )
    assert.equal(next, 22)
  })

  test('an absent from offset starts at zero', () => {
    const next = nextSearchFrom(
      { text: 'example' },
      { objects: [{}, {}] as never[], reachable: true, total: 100 },
    )
    assert.equal(next, 2)
  })

  test('the last page has no next offset', () => {
    const next = nextSearchFrom(
      { from: 98, text: 'example' },
      { objects: [{}, {}] as never[], reachable: true, total: 100 },
    )
    assert.equal(next, undefined)
  })

  test('an unreachable read has no next offset', () => {
    const next = nextSearchFrom(
      { text: 'example' },
      { objects: [], reachable: false },
    )
    assert.equal(next, undefined)
  })
})

describe('extractHttpStatus', () => {
  test('reads the status off an HttpResponseError', () => {
    const error = makeHttpResponseError(503, 'Service Unavailable')
    assert.equal(extractHttpStatus(error), 503)
  })

  test('reads the status off a PackumentNotFoundError', () => {
    assert.equal(
      extractHttpStatus(new PackumentNotFoundError('example-pkg', 404)),
      404,
    )
  })

  test('an unrelated error carries no status', () => {
    assert.equal(extractHttpStatus(new Error('socket hang up')), undefined)
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
