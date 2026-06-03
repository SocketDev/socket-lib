import { PassThrough, Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleOne, readExact, writeMessage } from '../../../src/native-messaging/host'
import { readSocketApiToken } from '../../../src/secrets/socket-api-token'

vi.mock('../../../src/secrets/socket-api-token', () => ({
  readSocketApiToken: vi.fn(),
}))

function readableFrom(chunks: Buffer[]): Readable {
  let idx = 0
  return new Readable({
    read() {
      if (idx < chunks.length) {
        this.push(chunks[idx++])
      } else {
        this.push(null)
      }
    },
  })
}

function captureStdout(): { sink: PassThrough; collected: () => Buffer[] } {
  const sink = new PassThrough()
  const chunks: Buffer[] = []
  sink.on('data', c => chunks.push(c as Buffer))
  return { sink, collected: () => chunks }
}

function decodeFrame(frame: Buffer): unknown {
  const len = frame.readUInt32LE(0)
  return JSON.parse(frame.subarray(4, 4 + len).toString('utf8'))
}

function makeMessage(obj: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8')
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(payload.length, 0)
  return Buffer.concat([header, payload])
}

describe('writeMessage', () => {
  it('writes a length-prefixed JSON frame to the given stream', () => {
    const { sink, collected } = captureStdout()
    writeMessage({ token: 'sk-abc' }, sink)
    const chunks = collected()
    expect(chunks).toHaveLength(1)
    expect(decodeFrame(chunks[0]!)).toEqual({ token: 'sk-abc' })
  })

  it('encodes error objects too', () => {
    const { sink, collected } = captureStdout()
    writeMessage({ error: 'not found' }, sink)
    expect(decodeFrame(collected()[0]!)).toEqual({ error: 'not found' })
  })
})

describe('readExact', () => {
  it('reads exactly N bytes from the given stream', async () => {
    const result = await readExact(5, readableFrom([Buffer.from('hello world')]))
    expect(result.toString('utf8')).toBe('hello')
  })

  it('assembles across multiple chunks', async () => {
    const result = await readExact(5, readableFrom([Buffer.from('hel'), Buffer.from('lo')]))
    expect(result.toString('utf8')).toBe('hello')
  })

  it('rejects when stream closes before length is met', async () => {
    await expect(readExact(100, readableFrom([Buffer.from('hi')]))).rejects.toThrow(
      'stdin closed before message was complete',
    )
  })
})

describe('handleOne', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns token for get-api-token when token is found', async () => {
    vi.mocked(readSocketApiToken).mockResolvedValue('sktsec_test_token')
    const { sink, collected } = captureStdout()
    await handleOne(readableFrom([makeMessage({ type: 'get-api-token' })]), sink)
    expect(decodeFrame(collected()[0]!)).toEqual({ token: 'sktsec_test_token' })
  })

  it('returns error when no token found', async () => {
    vi.mocked(readSocketApiToken).mockResolvedValue(undefined)
    const { sink, collected } = captureStdout()
    await handleOne(readableFrom([makeMessage({ type: 'get-api-token' })]), sink)
    expect((decodeFrame(collected()[0]!) as { error: string }).error).toMatch(/not found/i)
  })

  it('returns error for unknown message type', async () => {
    const { sink, collected } = captureStdout()
    await handleOne(readableFrom([makeMessage({ type: 'do-something-else' })]), sink)
    expect((decodeFrame(collected()[0]!) as { error: string }).error).toMatch(
      /unknown message type/,
    )
  })

  it('returns error for non-JSON body', async () => {
    const payload = Buffer.from('not json at all')
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(payload.length, 0)
    const { sink, collected } = captureStdout()
    await handleOne(readableFrom([Buffer.concat([header, payload])]), sink)
    expect((decodeFrame(collected()[0]!) as { error: string }).error).toMatch(/not valid JSON/)
  })

  it('returns error for invalid (zero) message length', async () => {
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(0, 0)
    const { sink, collected } = captureStdout()
    await handleOne(readableFrom([header]), sink)
    expect((decodeFrame(collected()[0]!) as { error: string }).error).toMatch(
      /invalid message length/,
    )
  })
})
