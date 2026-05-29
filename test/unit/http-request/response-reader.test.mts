import { describe, expect, test } from 'vitest'

import { compressBrotli } from '../../../src/compression/brotli'
import { compressGzip } from '../../../src/compression/gzip'
import { readIncomingResponse } from '../../../src/http-request/response-reader'

import type { IncomingResponse } from '../../../src/http-request/request-types'

// Build a fake IncomingMessage that's just async-iterable over byte chunks +
// the minimum shape our function reads (statusCode, statusMessage, headers).
function makeMsg(opts: {
  chunks: readonly Buffer[]
  statusCode?: number
  statusMessage?: string
  headers?: Record<string, string | string[] | undefined>
}): IncomingResponse {
  const { chunks, statusCode, statusMessage, headers = {} } = opts
  return {
    statusCode,
    statusMessage,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        yield c
      }
    },
  } as unknown as IncomingResponse
}

describe.sequential('http-request/response-reader — readIncomingResponse', () => {
  test('buffers chunked body and exposes it as text()', async () => {
    const msg = makeMsg({
      chunks: [Buffer.from('hello '), Buffer.from('world')],
      statusCode: 200,
      statusMessage: 'OK',
    })
    const response = await readIncomingResponse(msg)
    expect(response.text()).toBe('hello world')
  })

  test('exposes the buffered body as response.body', async () => {
    const msg = makeMsg({ chunks: [Buffer.from('hi')], statusCode: 200 })
    const response = await readIncomingResponse(msg)
    expect(response.body.toString('utf8')).toBe('hi')
  })

  test('json() parses the buffered body as JSON', async () => {
    const msg = makeMsg({
      chunks: [Buffer.from(JSON.stringify({ ok: true, n: 42 }))],
      statusCode: 200,
    })
    const response = await readIncomingResponse(msg)
    const data = response.json<{ ok: boolean; n: number }>()
    expect(data.ok).toBe(true)
    expect(data.n).toBe(42)
  })

  test('arrayBuffer() returns a sliced ArrayBuffer of the body bytes', async () => {
    const msg = makeMsg({ chunks: [Buffer.from('abc')], statusCode: 200 })
    const response = await readIncomingResponse(msg)
    const ab = response.arrayBuffer()
    expect(ab.byteLength).toBe(3)
  })

  test('ok is true for 200-299 status', async () => {
    for (const status of [200, 204, 299]) {
      const msg = makeMsg({ chunks: [], statusCode: status })
      const response = await readIncomingResponse(msg)
      expect(response.ok).toBe(true)
    }
  })

  test('ok is false for non-2xx status', async () => {
    for (const status of [199, 300, 404, 500]) {
      const msg = makeMsg({ chunks: [], statusCode: status })
      const response = await readIncomingResponse(msg)
      expect(response.ok).toBe(false)
    }
  })

  test('defaults statusCode to 0 when missing', async () => {
    const msg = makeMsg({ chunks: [] })
    const response = await readIncomingResponse(msg)
    expect(response.status).toBe(0)
    expect(response.ok).toBe(false)
  })

  test('defaults statusText to empty string when missing', async () => {
    const msg = makeMsg({ chunks: [], statusCode: 200 })
    const response = await readIncomingResponse(msg)
    expect(response.statusText).toBe('')
  })

  test('preserves headers from the message verbatim', async () => {
    const msg = makeMsg({
      chunks: [],
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'x-custom': 'v' },
    })
    const response = await readIncomingResponse(msg)
    expect(response.headers).toEqual({
      'content-type': 'application/json',
      'x-custom': 'v',
    })
  })

  test('rawResponse is the original IncomingMessage object', async () => {
    const msg = makeMsg({ chunks: [], statusCode: 200 })
    const response = await readIncomingResponse(msg)
    expect(response.rawResponse).toBe(msg)
  })

  test('handles an empty body', async () => {
    const msg = makeMsg({ chunks: [], statusCode: 204 })
    const response = await readIncomingResponse(msg)
    expect(response.text()).toBe('')
    expect(response.body.byteLength).toBe(0)
  })

  test('decompresses a gzip Content-Encoding body', async () => {
    const payload = JSON.stringify({ hello: 'gzip' })
    const compressed = await compressGzip(payload)
    const msg = makeMsg({
      chunks: [compressed],
      statusCode: 200,
      headers: { 'content-encoding': 'gzip' },
    })
    const response = await readIncomingResponse(msg)
    expect(response.text()).toBe(payload)
    expect(response.json<{ hello: string }>().hello).toBe('gzip')
  })

  test('decompresses a br Content-Encoding body', async () => {
    const payload = JSON.stringify({ hello: 'brotli' })
    const compressed = await compressBrotli(payload)
    const msg = makeMsg({
      chunks: [compressed],
      statusCode: 200,
      headers: { 'content-encoding': 'br' },
    })
    const response = await readIncomingResponse(msg)
    expect(response.text()).toBe(payload)
  })

  test('is case-insensitive on the encoding token', async () => {
    const payload = 'plain text body'
    const compressed = await compressGzip(payload)
    const msg = makeMsg({
      chunks: [compressed],
      statusCode: 200,
      headers: { 'content-encoding': 'GZIP' },
    })
    const response = await readIncomingResponse(msg)
    expect(response.text()).toBe(payload)
  })

  test('leaves the body untouched for identity / absent encoding', async () => {
    const msg = makeMsg({
      chunks: [Buffer.from('raw')],
      statusCode: 200,
      headers: { 'content-encoding': 'identity' },
    })
    const response = await readIncomingResponse(msg)
    expect(response.text()).toBe('raw')
  })

  test('does not attempt to decompress an empty body even when encoded', async () => {
    const msg = makeMsg({
      chunks: [],
      statusCode: 204,
      headers: { 'content-encoding': 'gzip' },
    })
    const response = await readIncomingResponse(msg)
    expect(response.body.byteLength).toBe(0)
  })
})
