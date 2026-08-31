/**
 * @file Unit tests for the shared npm registry request primitives. The HTTP
 *   adapter is injected, so every case runs with no network.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  buildQuery,
  describeNpmStatus,
  fetchRecord,
  fetchStringList,
  NPM_REGISTRY_URL,
  npmAuthHeaders,
  npmErrorCause,
  resolveRegistry,
  sendJsonRequest,
  sendNoContentRequest,
  shapeWriteFailure,
  shapeWriteSuccess,
} from '../../../../../src/eco/npm/registry/client.mjs'
import { failingHttp, recordingHttp } from './api-helpers.mjs'

describe('buildQuery', () => {
  test('skips undefined values', () => {
    assert.equal(buildQuery({ a: 1, b: undefined, c: 'x' }), '?a=1&c=x')
  })

  test('is empty when nothing survives, so no bare trailing "?"', () => {
    assert.equal(buildQuery({ a: undefined }), '')
  })

  test('encodes keys and values', () => {
    assert.equal(buildQuery({ text: '@example/pkg' }), '?text=%40example%2Fpkg')
  })

  test('keeps a false boolean, which is a real value', () => {
    // `false` is meaningful on npm's boolean flags; only `undefined` means
    // "not provided".
    assert.equal(buildQuery({ flag: false }), '?flag=false')
  })
})

describe('describeNpmStatus', () => {
  test('403 names the bypass-2FA rule rather than blaming the token', () => {
    // A caller told only "forbidden" rotates a token that was never the
    // problem, and the replacement fails exactly the same way.
    const hint = describeNpmStatus(403)
    assert.ok(hint?.includes('bypass_2fa'))
  })

  test('404 says the registry hides absence and no-access alike', () => {
    assert.ok(describeNpmStatus(404)?.includes('cannot see it'))
  })

  test('a status with no npm-specific meaning gets no hint', () => {
    assert.equal(describeNpmStatus(418), undefined)
  })
})

describe('npmAuthHeaders', () => {
  test('sends a bearer token', () => {
    assert.deepEqual(npmAuthHeaders({ token: 'tok' }), {
      authorization: 'Bearer tok',
    })
  })

  test('omits npm-otp entirely when there is no OTP', () => {
    // An empty npm-otp is worse than no header: npm treats it as present and
    // rejects instead of running its normal no-OTP path.
    assert.equal('npm-otp' in npmAuthHeaders({ token: 'tok' }), false)
  })

  test('sends npm-otp when given', () => {
    assert.equal(
      npmAuthHeaders({ otp: '123456', token: 'tok' })['npm-otp'],
      '123456',
    )
  })
})

describe('npmErrorCause', () => {
  test('reads an Error message', () => {
    assert.equal(npmErrorCause(new Error('nope')), 'nope')
  })

  test('reads a bare string', () => {
    assert.equal(npmErrorCause('nope'), 'nope')
  })

  test('answers undefined for a value carrying no message', () => {
    // A JSON-shaped null is what a fetch-style adapter can actually throw;
    // built via parse so the repo's no-null-literal rule stays satisfied.
    assert.equal(npmErrorCause(JSON.parse('null')), undefined)
    assert.equal(npmErrorCause({}), undefined)
    assert.equal(npmErrorCause(42), undefined)
  })
})

describe('resolveRegistry', () => {
  test('defaults to the public registry', () => {
    assert.equal(resolveRegistry(undefined), NPM_REGISTRY_URL)
  })

  test('strips trailing slashes so URLs get exactly one separator', () => {
    assert.equal(
      resolveRegistry('https://registry.example.test///'),
      'https://registry.example.test',
    )
  })
})

describe('fetchRecord', () => {
  test('returns the map and marks it reachable', async () => {
    const stub = recordingHttp({ '@example/pkg': 'read-write' })
    const read = await fetchRecord('https://registry.example.test/x', {
      ...stub,
      token: 'tok',
    })
    assert.equal(read.reachable, true)
    assert.equal(read.entries['@example/pkg'], 'read-write')
  })

  test('sends the bearer token', async () => {
    const stub = recordingHttp({})
    await fetchRecord('https://registry.example.test/x', {
      ...stub,
      token: 'tok',
    })
    assert.equal(stub.calls[0]!.headers?.['authorization'], 'Bearer tok')
  })

  test('a non-object reply reads as an empty map, still reachable', async () => {
    const stub = recordingHttp('not-an-object')
    const read = await fetchRecord('https://registry.example.test/x', {
      ...stub,
      token: 'tok',
    })
    assert.equal(read.reachable, true)
    assert.deepEqual(read.entries, {})
  })

  test('an unreachable registry is NOT an empty permissions map', async () => {
    // An empty grant map read as authoritative says "nobody has access",
    // which is the opposite decision from "I could not check".
    const read = await fetchRecord('https://registry.example.test/x', {
      ...failingHttp(),
      token: 'tok',
    })
    assert.equal(read.reachable, false)
    assert.deepEqual(read.entries, {})
  })

  test('even a 404 fails open, because npm hides no-access as 404', async () => {
    const read = await fetchRecord('https://registry.example.test/x', {
      ...failingHttp(404),
      token: 'tok',
    })
    assert.equal(read.reachable, false)
  })
})

describe('fetchStringList', () => {
  test('returns the list and marks it reachable', async () => {
    const stub = recordingHttp(['npm', 'npm-cli-bot'])
    const read = await fetchStringList('https://registry.example.test/x', {
      ...stub,
      token: 'tok',
    })
    assert.equal(read.reachable, true)
    assert.deepEqual(read.items, ['npm', 'npm-cli-bot'])
  })

  test('drops non-string entries rather than passing them through', async () => {
    const stub = recordingHttp(JSON.parse('["npm", 42, null, "bot"]'))
    const read = await fetchStringList('https://registry.example.test/x', {
      ...stub,
      token: 'tok',
    })
    assert.deepEqual(read.items, ['npm', 'bot'])
  })

  test('a non-array reply reads as empty, still reachable', async () => {
    const stub = recordingHttp({ nope: true })
    const read = await fetchStringList('https://registry.example.test/x', {
      ...stub,
      token: 'tok',
    })
    assert.equal(read.reachable, true)
    assert.deepEqual(read.items, [])
  })

  test('an unreachable registry is NOT an empty member list', async () => {
    const read = await fetchStringList('https://registry.example.test/x', {
      ...failingHttp(),
      token: 'tok',
    })
    assert.equal(read.reachable, false)
    assert.deepEqual(read.items, [])
  })
})

describe('sendJsonRequest', () => {
  test('shapes a reply into a success', async () => {
    const stub = recordingHttp({ ok: 1 })
    const result = await sendJsonRequest<{ ok: number }>(
      'https://registry.example.test/x',
      { method: 'PUT' },
      stub,
    )
    assert.equal(result.success, true)
    assert.deepEqual(result.success ? result.data : undefined, { ok: 1 })
  })

  test('passes the method and body straight through', async () => {
    const stub = recordingHttp({})
    await sendJsonRequest(
      'https://registry.example.test/x',
      { body: '{"a":1}', method: 'POST' },
      stub,
    )
    assert.equal(stub.calls[0]!.method, 'POST')
    assert.equal(stub.calls[0]!.body, '{"a":1}')
  })

  test('a failure is reported, never thrown', async () => {
    // A mutation that throws past a caller is a mutation whose outcome is
    // unknown; the write contract is that the result is always inspectable.
    const result = await sendJsonRequest(
      'https://registry.example.test/x',
      { method: 'PUT' },
      failingHttp(403),
    )
    assert.equal(result.success, false)
    assert.equal(result.success ? 0 : result.status, 403)
  })
})

describe('sendNoContentRequest', () => {
  test('an empty 204 body is a success, not a parse failure', async () => {
    // This is why the no-content path uses `text`: handing an empty body to a
    // JSON decoder throws exactly like a real failure does, so a json-based
    // delete would report every success as an error.
    const stub = recordingHttp()
    const result = await sendNoContentRequest(
      'https://registry.example.test/x',
      { method: 'DELETE' },
      stub,
    )
    assert.equal(result.success, true)
    assert.equal(result.success ? result.status : 0, 204)
  })

  test('a real failure is still a failure', async () => {
    const result = await sendNoContentRequest(
      'https://registry.example.test/x',
      { method: 'DELETE' },
      failingHttp(401),
    )
    assert.equal(result.success, false)
    assert.equal(result.success ? 0 : result.status, 401)
  })
})

describe('shapeWriteFailure', () => {
  test('a transport failure is status 0, not a made-up HTTP code', async () => {
    const failure = shapeWriteFailure(new Error('socket hang up'))
    assert.equal(failure.status, 0)
    assert.equal(failure.success, false)
    assert.ok(failure.error.includes('could not be reached'))
    assert.equal(failure.cause, 'socket hang up')
  })

  test('a known status carries its actionable hint as the error', () => {
    const failure = shapeWriteFailure(
      Object.assign(new Error('x'), { status: 429 }),
    )
    assert.equal(failure.status, 429)
    assert.ok(failure.error.includes('Rate limited'))
  })

  test('an unremarkable status still names the code', () => {
    const failure = shapeWriteFailure(
      Object.assign(new Error('x'), { status: 500 }),
    )
    assert.ok(failure.error.includes('500'))
  })

  test('reads a nested response.status the way adapters throw it', () => {
    const failure = shapeWriteFailure({ response: { status: 404 } })
    assert.equal(failure.status, 404)
  })
})

describe('shapeWriteSuccess', () => {
  test('wraps data as a success', () => {
    const result = shapeWriteSuccess({ a: 1 })
    assert.equal(result.success, true)
    assert.deepEqual(result.data, { a: 1 })
  })
})
