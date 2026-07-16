import crypto from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// We can't intercept `httpDownloadAttempt` directly (it's called as a
// local symbol from `httpDownload`), so we mock the lower-level
// `httpRequestAttempt` AND the file-stream getter from `_internal` so we
// can:
//   1. Return a fake streaming response with a controllable rawResponse.
//   2. Write the expected bytes to the temp file via that fake stream.
import { PassThrough } from 'node:stream'

import { minTimerQuantum } from '../../_shared/fleet/lib/timing.mts'

import type * as HttpRequestModule from '../../../src/http-request/request'

const { mockHttpRequestAttempt } = vi.hoisted(() => ({
  mockHttpRequestAttempt: vi.fn(),
}))

vi.mock(import('../../../src/http-request/request'), async () => {
  const actual = await vi.importActual<typeof HttpRequestModule>(
    '../../../src/http-request/request',
  )
  return { ...actual, httpRequestAttempt: mockHttpRequestAttempt }
})

function makeFakeResponse(opts: {
  ok?: boolean | undefined
  status?: number | undefined
  statusText?: string | undefined
  body?: string | undefined
  headers?: Record<string, string | string[] | undefined> | undefined
}) {
  const { body = '', headers = {}, ok = true } = opts
  const status = opts.status ?? (ok ? 200 : 500)
  const statusText = opts.statusText ?? (ok ? 'OK' : 'Error')
  const rawResponse = new PassThrough()
  queueMicrotask(() => {
    if (body) {
      rawResponse.write(body)
    }
    rawResponse.end()
  })
  return {
    body: Buffer.from(body),
    headers: { 'content-length': String(body.length), ...headers },
    ok,
    rawResponse,
    status,
    statusText,
    text: () => body,
    json: () => JSON.parse(body),
    arrayBuffer: () => new ArrayBuffer(0),
  }
}

let tmpRoot: string

async function loadFresh() {
  const mod = await import('../../../src/http-request/download')
  return { httpDownload: mod.httpDownload }
}

function sha256Hex(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function sha512Integrity(content: string): string {
  return `sha512-${crypto.createHash('sha512').update(content).digest('base64')}`
}

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'http-download-test-'))
  vi.resetModules()
  mockHttpRequestAttempt.mockReset()
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
  vi.clearAllMocks()
})

describe.sequential('http-request/download — happy path', () => {
  test('writes file at destPath via atomic rename from temp', async () => {
    const dest = path.join(tmpRoot, 'tool.bin')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({ body: 'downloaded-bytes' }),
    )
    const { httpDownload } = await loadFresh()
    const result = await httpDownload('https://example.com/tool', dest)
    expect(result.path).toBe(dest)
    expect(existsSync(dest)).toBe(true)
    expect(readFileSync(dest, 'utf8')).toBe('downloaded-bytes')
  })

  test('returns merged result with original headers/status', async () => {
    const dest = path.join(tmpRoot, 'tool2.bin')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({
        body: 'x',
        headers: { 'content-type': 'application/octet-stream' },
      }),
    )
    const { httpDownload } = await loadFresh()
    const result = await httpDownload('https://example.com/tool', dest)
    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toBe('application/octet-stream')
    expect(result.size).toBe(1)
    expect(result.sha256).toBe(sha256Hex('x'))
    expect(result.integrity).toBe(sha512Integrity('x'))
  })

  test('uses an injected write stream with the temp path and response size', async () => {
    const dest = path.join(tmpRoot, 'custom-stream.bin')
    const body = 'streamed-directly'
    const createDownloadStream = vi.fn(
      (streamPath: string, options: { size: number }) => {
        expect(options.size).toBe(body.length)
        return createWriteStream(streamPath)
      },
    )
    mockHttpRequestAttempt.mockResolvedValueOnce(makeFakeResponse({ body }))
    const { httpDownload } = await loadFresh()
    const result = await httpDownload('https://example.com/tool', dest, {
      createWriteStream: createDownloadStream,
    })
    expect(createDownloadStream).toHaveBeenCalledOnce()
    expect(createDownloadStream.mock.calls[0]![0]).toMatch(/\.download$/)
    expect(result.integrity).toBe(sha512Integrity(body))
    expect(readFileSync(dest, 'utf8')).toBe(body)
  })

  test('uses the regular file writer when Content-Length is unavailable', async () => {
    const dest = path.join(tmpRoot, 'unknown-size.bin')
    const createDownloadStream = vi.fn(() => createWriteStream(dest))
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({
        body: 'unknown-size',
        headers: { 'content-length': undefined },
      }),
    )
    const { httpDownload } = await loadFresh()
    await httpDownload('https://example.com/tool', dest, {
      createWriteStream: createDownloadStream,
    })
    expect(createDownloadStream).not.toHaveBeenCalled()
    expect(readFileSync(dest, 'utf8')).toBe('unknown-size')
  })

  test('throws HttpResponseError when response.ok is false', async () => {
    const dest = path.join(tmpRoot, 'tool-not-found.bin')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({ ok: false, status: 404, statusText: 'Not Found' }),
    )
    const { httpDownload } = await loadFresh()
    await expect(httpDownload('https://example.com/x', dest)).rejects.toThrow(
      /Download failed: HTTP 404/,
    )
  })
})

describe.sequential('http-request/download — stale dest overwrite', () => {
  test('overwrites an existing dest file via atomic rename', async () => {
    const dest = path.join(tmpRoot, 'staletest.bin')
    writeFileSync(dest, 'prior-content')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({ body: 'new-content' }),
    )
    const { httpDownload } = await loadFresh()
    await httpDownload('https://example.com/x', dest)
    expect(readFileSync(dest, 'utf8')).toBe('new-content')
  })
})

describe.sequential('http-request/download — sha256 verification', () => {
  test('accepts a matching sha256', async () => {
    const dest = path.join(tmpRoot, 'sha-ok.bin')
    const body = 'verified-bytes'
    const expected = sha256Hex(body)
    mockHttpRequestAttempt.mockResolvedValueOnce(makeFakeResponse({ body }))
    const { httpDownload } = await loadFresh()
    const result = await httpDownload('https://example.com/x', dest, {
      sha256: expected,
    })
    expect(result.path).toBe(dest)
  })

  test('throws on sha256 mismatch', async () => {
    const dest = path.join(tmpRoot, 'sha-bad.bin')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({ body: 'wrong-bytes' }),
    )
    const { httpDownload } = await loadFresh()
    await expect(
      httpDownload('https://example.com/x', dest, {
        sha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/Checksum verification failed/)
    expect(existsSync(dest)).toBe(false)
  })

  test('lowercases the expected sha256 before comparing (timing-safe)', async () => {
    const dest = path.join(tmpRoot, 'sha-uppercase.bin')
    const body = 'check-case'
    const expected = sha256Hex(body)
    mockHttpRequestAttempt.mockResolvedValueOnce(makeFakeResponse({ body }))
    const { httpDownload } = await loadFresh()
    const result = await httpDownload('https://example.com/x', dest, {
      sha256: expected.toUpperCase(),
    })
    expect(result.path).toBe(dest)
  })
})

describe.sequential('http-request/download — SRI verification', () => {
  test('accepts a matching streamed SHA-512 integrity', async () => {
    const dest = path.join(tmpRoot, 'integrity-ok.bin')
    const body = 'verified-integrity'
    mockHttpRequestAttempt.mockResolvedValueOnce(makeFakeResponse({ body }))
    const { httpDownload } = await loadFresh()
    const result = await httpDownload('https://example.com/x', dest, {
      integrity: sha512Integrity(body),
    })
    expect(result.path).toBe(dest)
  })

  test('rejects a mismatch before publishing the destination', async () => {
    const dest = path.join(tmpRoot, 'integrity-bad.bin')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({ body: 'wrong-integrity' }),
    )
    const { httpDownload } = await loadFresh()
    await expect(
      httpDownload('https://example.com/x', dest, {
        integrity: sha512Integrity('expected-integrity'),
      }),
    ).rejects.toThrow(/Integrity verification failed/)
    expect(existsSync(dest)).toBe(false)
  })
})

describe.sequential('http-request/download — retry loop', () => {
  test('retries after a failed attempt and succeeds on retry', async () => {
    const dest = path.join(tmpRoot, 'retry-ok.bin')
    mockHttpRequestAttempt
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(makeFakeResponse({ body: 'recovered' }))
    const { httpDownload } = await loadFresh()
    const result = await httpDownload('https://example.com/x', dest, {
      retries: 1,
      retryDelay: 0,
    })
    expect(result.path).toBe(dest)
    expect(mockHttpRequestAttempt).toHaveBeenCalledTimes(2)
  })

  test('throws the last error when all retries are exhausted', async () => {
    const dest = path.join(tmpRoot, 'retry-fail.bin')
    mockHttpRequestAttempt.mockRejectedValue(new Error('persistent'))
    const { httpDownload } = await loadFresh()
    await expect(
      httpDownload('https://example.com/x', dest, {
        retries: 2,
        retryDelay: 0,
      }),
    ).rejects.toThrow(/persistent/)
    expect(mockHttpRequestAttempt).toHaveBeenCalledTimes(3)
  })
})

describe.sequential('http-request/download — option pass-through', () => {
  test('forwards ca / headers / maxRedirects / timeout to httpRequestAttempt', async () => {
    const dest = path.join(tmpRoot, 'passthrough.bin')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({ body: '.' }),
    )
    const { httpDownload } = await loadFresh()
    await httpDownload('https://example.com/x', dest, {
      ca: ['fake-ca'],
      headers: { Authorization: 'Bearer x' },
      maxRedirects: 2,
      timeout: 5000,
    })
    const [, opts] = mockHttpRequestAttempt.mock.calls[0]!
    const o = opts as {
      ca?: string[] | undefined
      headers?: Record<string, string> | undefined
      maxRedirects?: number | undefined
      timeout?: number | undefined
      stream?: boolean | undefined
    }
    expect(o.ca).toEqual(['fake-ca'])
    expect(o.headers).toEqual({ Authorization: 'Bearer x' })
    expect(o.maxRedirects).toBe(2)
    expect(o.timeout).toBe(5000)
    expect(o.stream).toBe(true)
  })

  test('uses defaults: followRedirects=true, maxRedirects=5, timeout=120000', async () => {
    const dest = path.join(tmpRoot, 'defaults.bin')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({ body: '.' }),
    )
    const { httpDownload } = await loadFresh()
    await httpDownload('https://example.com/x', dest)
    const [, opts] = mockHttpRequestAttempt.mock.calls[0]!
    const o = opts as {
      followRedirects?: boolean | undefined
      maxRedirects?: number | undefined
      timeout?: number | undefined
    }
    expect(o.followRedirects).toBe(true)
    expect(o.maxRedirects).toBe(5)
    expect(o.timeout).toBe(120_000)
  })
})

describe.sequential('http-request/download — temp/stream cleanup branches', () => {
  test('cleans up a leftover temp file from a failed attempt before retrying', async () => {
    const dest = path.join(tmpRoot, 'retry-cleanup.bin')
    // First attempt: response succeeds, but checksum mismatch leaves temp
    // file pending — the catch arm at L192-195 runs.
    // Then second attempt succeeds with the correct content.
    mockHttpRequestAttempt
      .mockResolvedValueOnce(makeFakeResponse({ body: 'wrong' }))
      .mockResolvedValueOnce(makeFakeResponse({ body: 'right' }))
    const expected = sha256Hex('right')
    const { httpDownload } = await loadFresh()
    const result = await httpDownload('https://example.com/x', dest, {
      retries: 1,
      retryDelay: 0,
      sha256: expected,
    })
    expect(result.path).toBe(dest)
    expect(readFileSync(dest, 'utf8')).toBe('right')
  })

  test('rejects when rawResponse emits an error mid-stream', async () => {
    const dest = path.join(tmpRoot, 'res-error.bin')
    const rawResponse = new PassThrough()
    // Attach an error listener BEFORE the function runs to consume the error
    // event we'll emit. The download fn also attaches one inside the Promise
    // executor; both consume the same emit.
    rawResponse.on('error', () => {})
    mockHttpRequestAttempt.mockResolvedValueOnce({
      body: Buffer.from(''),
      headers: { 'content-length': '0' },
      ok: true,
      rawResponse,
      status: 200,
      statusText: 'OK',
      text: () => '',
      json: () => ({}),
      arrayBuffer: () => new ArrayBuffer(0),
    })
    const { httpDownload } = await loadFresh()
    setTimeout(
      () => rawResponse.emit('error', new Error('network-blip')),
      minTimerQuantum(10),
    )
    await expect(httpDownload('https://example.com/x', dest)).rejects.toThrow(
      /network-blip/,
    )
  })

  test('rejects with a wrapped error when the destination write stream errors', async () => {
    // Point destPath at a non-existent parent dir — createWriteStream emits an
    // ENOENT error on the open. fileStream.on('error') wraps and rejects.
    const dest = path.join(tmpRoot, 'no-such-dir', 'file.bin')
    mockHttpRequestAttempt.mockResolvedValueOnce(
      makeFakeResponse({ body: 'data' }),
    )
    const { httpDownload } = await loadFresh()
    await expect(httpDownload('https://example.com/x', dest)).rejects.toThrow(
      /Failed to write file/,
    )
  })

  test('reports onProgress with downloaded/total when content-length is set', async () => {
    const dest = path.join(tmpRoot, 'progress.bin')
    const body = 'abcdefghij'
    mockHttpRequestAttempt.mockResolvedValueOnce(makeFakeResponse({ body }))
    const progress: Array<[number, number]> = []
    const { httpDownload } = await loadFresh()
    await httpDownload('https://example.com/x', dest, {
      onProgress: (downloaded, total) => progress.push([downloaded, total]),
    })
    expect(progress.length).toBeGreaterThan(0)
    const last = progress[progress.length - 1]!
    expect(last[0]).toBe(body.length)
    expect(last[1]).toBe(body.length)
  })
})
