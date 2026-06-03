import { Readable, Writable } from 'node:stream'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleOne, readExact, writeMessage } from '../../../src/native-messaging/host'

vi.mock('../../../src/secrets/socket-api-token', () => ({
  readSocketApiToken: vi.fn(),
}))

function makeStdin(chunks: Buffer[]): void {
  let idx = 0
  const readable = new Readable({
    read() {
      if (idx < chunks.length) {
        this.push(chunks[idx++])
      } else {
        this.push(null)
      }
    },
  })
  Object.defineProperty(process, 'stdin', { value: readable, writable: true, configurable: true })
}

function captureStdout(): { chunks: Buffer[]; restore: () => void } {
  const chunks: Buffer[] = []
  const original = process.stdout.write.bind(process.stdout)
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
    return true
  })
  return {
    chunks,
    restore: () => {
      spy.mockRestore()
      process.stdout.write = original
    },
  }
}

function makeMessage(obj: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8')
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(payload.length, 0)
  return Buffer.concat([header, payload])
}

describe('writeMessage', () => {
  it('writes a length-prefixed JSON frame to stdout', () => {
    const { chunks, restore } = captureStdout()
    try {
      writeMessage({ token: 'sk-abc' })
      expect(chunks).toHaveLength(1)
      const frame = chunks[0]!
      const len = frame.readUInt32LE(0)
      const body = JSON.parse(frame.subarray(4, 4 + len).toString('utf8'))
      expect(body).toEqual({ token: 'sk-abc' })
    } finally {
      restore()
    }
  })

  it('handles nested objects', () => {
    const { chunks, restore } = captureStdout()
    try {
      writeMessage({ error: 'not found' })
      const frame = chunks[0]!
      const len = frame.readUInt32LE(0)
      const body = JSON.parse(frame.subarray(4, 4 + len).toString('utf8'))
      expect(body).toEqual({ error: 'not found' })
    } finally {
      restore()
    }
  })
})

describe('readExact', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads exactly N bytes from stdin', async () => {
    makeStdin([Buffer.from('hello world')])
    const result = await readExact(5)
    expect(result.toString('utf8')).toBe('hello')
  })

  it('assembles across multiple chunks', async () => {
    makeStdin([Buffer.from('hel'), Buffer.from('lo')])
    const result = await readExact(5)
    expect(result.toString('utf8')).toBe('hello')
  })

  it('rejects when stdin closes before length is met', async () => {
    makeStdin([Buffer.from('hi')])
    await expect(readExact(100)).rejects.toThrow('stdin closed before message was complete')
  })
})

describe('handleOne', () => {
  const { readSocketApiToken } = await import('../../../src/secrets/socket-api-token')

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns token for get-api-token when token is found', async () => {
    vi.mocked(readSocketApiToken).mockResolvedValue('sktsec_test_token')
    makeStdin([makeMessage({ type: 'get-api-token' })])
    const { chunks, restore } = captureStdout()
    try {
      await handleOne()
      const frame = chunks[0]!
      const len = frame.readUInt32LE(0)
      const body = JSON.parse(frame.subarray(4, 4 + len).toString('utf8'))
      expect(body).toEqual({ token: 'sktsec_test_token' })
    } finally {
      restore()
    }
  })

  it('returns error when no token found', async () => {
    vi.mocked(readSocketApiToken).mockResolvedValue(undefined)
    makeStdin([makeMessage({ type: 'get-api-token' })])
    const { chunks, restore } = captureStdout()
    try {
      await handleOne()
      const frame = chunks[0]!
      const len = frame.readUInt32LE(0)
      const body = JSON.parse(frame.subarray(4, 4 + len).toString('utf8'))
      expect(body.error).toMatch(/not found/i)
    } finally {
      restore()
    }
  })

  it('returns error for unknown message type', async () => {
    makeStdin([makeMessage({ type: 'do-something-else' })])
    const { chunks, restore } = captureStdout()
    try {
      await handleOne()
      const frame = chunks[0]!
      const len = frame.readUInt32LE(0)
      const body = JSON.parse(frame.subarray(4, 4 + len).toString('utf8'))
      expect(body.error).toMatch(/unknown message type/)
    } finally {
      restore()
    }
  })

  it('returns error for non-JSON body', async () => {
    const payload = Buffer.from('not json at all')
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(payload.length, 0)
    makeStdin([Buffer.concat([header, payload])])
    const { chunks, restore } = captureStdout()
    try {
      await handleOne()
      const frame = chunks[0]!
      const len = frame.readUInt32LE(0)
      const body = JSON.parse(frame.subarray(4, 4 + len).toString('utf8'))
      expect(body.error).toMatch(/not valid JSON/)
    } finally {
      restore()
    }
  })

  it('returns error for invalid (zero) message length', async () => {
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(0, 0)
    makeStdin([header])
    const { chunks, restore } = captureStdout()
    try {
      await handleOne()
      const frame = chunks[0]!
      const len = frame.readUInt32LE(0)
      const body = JSON.parse(frame.subarray(4, 4 + len).toString('utf8'))
      expect(body.error).toMatch(/invalid message length/)
    } finally {
      restore()
    }
  })
})
