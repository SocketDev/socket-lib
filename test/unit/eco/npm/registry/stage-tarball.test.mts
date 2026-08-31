/**
 * @file Unit tests for the staged-tarball read. The HTTP adapter is injected,
 *   so every case runs with no network and no real archive is downloaded.
 *   The point of these cases is the BINARY path: that the bytes handed back
 *   are the bytes the adapter produced, byte for byte, and that the fail-open
 *   contract separates "npm said 404" from "npm could not be asked".
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  fetchStagedTarball,
  stagedTarballUrl,
} from '../../../../../src/eco/npm/registry/stage-tarball.mjs'

const AUTH = { token: 'tok' }

const STAGE_ID = '1de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f'

const TARBALL_URL = `https://registry.npmjs.org/-/stage/${STAGE_ID}/tarball`

/**
 * Bytes that are NOT valid UTF-8. 0xc3 starts a two-byte sequence and 0x28 is
 * not a valid continuation, so a text-decoding adapter would replace the pair
 * with U+FFFD and the round trip would come back a different length. Real
 * gzip data is full of sequences like this, which is exactly why the adapter
 * grew a `bytes` method.
 */
const BINARY_BODY = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xc3, 0x28, 0xff])

/**
 * An adapter that answers `payload` from `bytes` and records the request.
 */
function bytesHttp(payload: Uint8Array) {
  const calls: Array<{
    headers?: Record<string, string> | undefined
    method?: string | undefined
    url: string
  }> = []
  return {
    calls,
    http: {
      async bytes(
        url: string,
        init?:
          | {
              headers?: Record<string, string> | undefined
              method?: string | undefined
            }
          | undefined,
      ): Promise<Uint8Array> {
        calls.push({ headers: init?.headers, method: init?.method, url })
        return payload
      },
      async json<T>(): Promise<T> {
        throw new Error('bytesHttp: json is not part of this test')
      },
      async text(): Promise<string> {
        throw new Error('bytesHttp: text is not part of this test')
      },
    },
  }
}

/**
 * An adapter whose `bytes` rejects. `status` shapes the error the way a real
 * adapter would; omitting it models a transport failure that carries none.
 */
function failingBytesHttp(status?: number | undefined) {
  const error = () =>
    Object.assign(new Error('boom'), status === undefined ? {} : { status })
  return {
    http: {
      async bytes(): Promise<Uint8Array> {
        throw error()
      },
      async json<T>(): Promise<T> {
        throw error()
      },
      async text(): Promise<string> {
        throw error()
      },
    },
  }
}

describe('stagedTarballUrl', () => {
  test('builds the documented path for a stage id', () => {
    const request = stagedTarballUrl(STAGE_ID, AUTH)
    assert.equal(request.url, TARBALL_URL)
  })

  test('sends the bearer token and asks for octet-stream', () => {
    const request = stagedTarballUrl(STAGE_ID, AUTH)
    assert.equal(request.headers['authorization'], 'Bearer tok')
    assert.equal(request.headers['accept'], 'application/octet-stream')
  })

  test('carries an OTP when one is supplied', () => {
    const request = stagedTarballUrl(STAGE_ID, { otp: '123456', token: 'tok' })
    assert.equal(request.headers['npm-otp'], '123456')
  })

  test('omits the OTP header when none is supplied', () => {
    const request = stagedTarballUrl(STAGE_ID, AUTH)
    assert.equal(request.headers['npm-otp'], undefined)
  })

  test('honors a registry override and drops its trailing slash', () => {
    const request = stagedTarballUrl(STAGE_ID, {
      registry: 'https://registry.example.test/',
      token: 'tok',
    })
    assert.equal(
      request.url,
      `https://registry.example.test/-/stage/${STAGE_ID}/tarball`,
    )
  })

  test('encodes a stage id that would otherwise break the path', () => {
    const request = stagedTarballUrl('a/b?c', AUTH)
    assert.equal(
      request.url,
      'https://registry.npmjs.org/-/stage/a%2Fb%3Fc/tarball',
    )
  })
})

describe('fetchStagedTarball', () => {
  test('returns the bytes unchanged, including invalid UTF-8', async () => {
    const stub = bytesHttp(BINARY_BODY)
    const read = await fetchStagedTarball(STAGE_ID, { ...stub, ...AUTH })
    assert.equal(read.reachable, true)
    assert.deepEqual(Array.from(read.bytes!), Array.from(BINARY_BODY))
  })

  test('GETs the tarball route with the auth headers', async () => {
    const stub = bytesHttp(BINARY_BODY)
    await fetchStagedTarball(STAGE_ID, { ...stub, ...AUTH })
    assert.equal(stub.calls.length, 1)
    assert.equal(stub.calls[0]!.url, TARBALL_URL)
    assert.equal(stub.calls[0]!.method, 'GET')
    assert.equal(stub.calls[0]!.headers!['authorization'], 'Bearer tok')
    assert.equal(stub.calls[0]!.headers!['accept'], 'application/octet-stream')
  })

  test('uses a registry override', async () => {
    const stub = bytesHttp(BINARY_BODY)
    await fetchStagedTarball(STAGE_ID, {
      ...stub,
      registry: 'https://registry.example.test',
      token: 'tok',
    })
    assert.equal(
      stub.calls[0]!.url,
      `https://registry.example.test/-/stage/${STAGE_ID}/tarball`,
    )
  })

  test('reports a 404 as reachable with no bytes', async () => {
    const read = await fetchStagedTarball(STAGE_ID, {
      ...failingBytesHttp(404),
      ...AUTH,
    })
    assert.deepEqual(read, { bytes: undefined, reachable: true })
  })

  test('reads a 404 carried on response.status too', async () => {
    const notFound = () => {
      const e = new Error('HTTP 404')
      ;(e as unknown as { response: { status: number } }).response = {
        status: 404,
      }
      return e
    }
    const read = await fetchStagedTarball(STAGE_ID, {
      ...AUTH,
      http: {
        async bytes(): Promise<Uint8Array> {
          throw notFound()
        },
        async json<T>(): Promise<T> {
          throw notFound()
        },
        async text(): Promise<string> {
          throw notFound()
        },
      },
    })
    assert.deepEqual(read, { bytes: undefined, reachable: true })
  })

  test('reports a 401 as unreachable rather than as an empty tarball', async () => {
    const read = await fetchStagedTarball(STAGE_ID, {
      ...failingBytesHttp(401),
      ...AUTH,
    })
    assert.deepEqual(read, { reachable: false })
    assert.equal(read.bytes, undefined)
  })

  test('reports a 500 as unreachable', async () => {
    const read = await fetchStagedTarball(STAGE_ID, {
      ...failingBytesHttp(500),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
  })

  test('reports a transport failure with no status as unreachable', async () => {
    const read = await fetchStagedTarball(STAGE_ID, {
      ...failingBytesHttp(),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
  })
})
