/**
 * @file Tests for uncovered Logger methods: done(), progress(), clearLine()
 *   (TTY + non-TTY paths), resetIndent() (bound + unbound), logNewline()
 *   blank-skip. Each test creates a Logger with custom Writable streams so we
 *   can capture output without polluting the real stdout/stderr.
 */

import { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { Logger } from '../../../src/logger/node'

class CaptureStream extends Writable {
  chunks: string[] = []
  isTTY = false
  cursorTo: (x: number) => void
  clearLine: (dir: number) => void
  constructor(opts: { isTTY?: boolean | undefined } = {}) {
    super()
    this.isTTY = opts.isTTY ?? false
    this.cursorTo = () => {}
    this.clearLine = () => {}
  }
  // oxlint-disable-next-line socket/no-underscore-identifier -- `_write` is Node's `stream.Writable` override hook; the name is fixed by the Node API, not a privacy marker.
  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    cb()
  }
  get text(): string {
    return this.chunks.join('')
  }
}

export function makeLogger(opts?: {
  stdoutTTY?: boolean | undefined
  stderrTTY?: boolean | undefined
}) {
  const stdout = new CaptureStream({ isTTY: opts?.stdoutTTY ?? false })
  const stderr = new CaptureStream({ isTTY: opts?.stderrTTY ?? false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logger = new Logger({ stdout: stdout as any, stderr: stderr as any })
  return { logger, stdout, stderr }
}

describe('logger — uncovered methods', () => {
  describe('done()', () => {
    it('writes a success-symboled message to stderr', () => {
      const { logger, stderr } = makeLogger()
      logger.done('completed')
      expect(stderr.text).toContain('completed')
    })

    it('returns the logger for chaining', () => {
      const { logger } = makeLogger()
      expect(logger.done('x')).toBe(logger)
    })
  })

  describe('progress()', () => {
    it('writes a progress line directly to the target stream', () => {
      const { logger, stderr } = makeLogger()
      logger.progress('working')
      expect(stderr.text).toContain('working')
    })

    it('returns the logger for chaining', () => {
      const { logger } = makeLogger()
      expect(logger.progress('x')).toBe(logger)
    })

    it('respects bound stream (stdout when bound to stdout)', () => {
      const { logger, stdout } = makeLogger()
      logger.stdout.progress('work')
      expect(stdout.text).toContain('work')
    })
  })

  describe('clearLine()', () => {
    it('is a no-op on a non-TTY stream (no throw)', () => {
      const { logger } = makeLogger({ stdoutTTY: false, stderrTTY: false })
      expect(() => logger.clearLine()).not.toThrow()
    })

    it('clears the current line on a TTY stream', () => {
      const { logger, stderr } = makeLogger({ stderrTTY: true })
      let cursorCalled = false
      let clearCalled = false
      stderr.cursorTo = () => {
        cursorCalled = true
      }
      stderr.clearLine = () => {
        clearCalled = true
      }
      logger.clearLine()
      expect(cursorCalled).toBe(true)
      expect(clearCalled).toBe(true)
    })

    it('returns the logger for chaining', () => {
      const { logger } = makeLogger()
      expect(logger.clearLine()).toBe(logger)
    })
  })

  describe('resetIndent()', () => {
    it('resets indent on the unbound logger (both streams)', () => {
      const { logger } = makeLogger()
      logger.indent().indent()
      expect(() => logger.resetIndent()).not.toThrow()
    })

    it('resets indent on a stream-bound logger (stdout)', () => {
      const { logger } = makeLogger()
      logger.stdout.indent()
      expect(() => logger.stdout.resetIndent()).not.toThrow()
    })

    it('resets indent on a stream-bound logger (stderr)', () => {
      const { logger } = makeLogger()
      logger.stderr.indent()
      expect(() => logger.stderr.resetIndent()).not.toThrow()
    })

    it('returns the logger for chaining', () => {
      const { logger } = makeLogger()
      expect(logger.resetIndent()).toBe(logger)
    })
  })

  describe('logNewline()', () => {
    it('writes a blank line on first call', () => {
      const { logger, stdout } = makeLogger()
      logger.log('first')
      logger.logNewline()
      expect(stdout.text.split('\n').length).toBeGreaterThan(2)
    })

    it('skips when the previous output was already blank', () => {
      const { logger, stdout } = makeLogger()
      logger.logNewline()
      logger.logNewline()
      // Second call should be skipped — no new content appended.
      const before = stdout.text
      logger.logNewline()
      expect(stdout.text).toBe(before)
    })

    it('returns the logger for chaining', () => {
      const { logger } = makeLogger()
      expect(logger.logNewline()).toBe(logger)
    })
  })

  describe('skip()', () => {
    it('writes a skip-symboled message to stderr', () => {
      const { logger, stderr } = makeLogger()
      logger.skip('skipped')
      expect(stderr.text).toContain('skipped')
    })
  })

  describe('write()', () => {
    it('writes raw text directly to stdout (bypassing Console formatting)', () => {
      const { logger, stdout } = makeLogger()
      logger.write('raw output without newline')
      expect(stdout.text).toContain('raw output without newline')
    })

    it('returns the logger for chaining', () => {
      const { logger } = makeLogger()
      expect(logger.write('x')).toBe(logger)
    })
  })

  describe('errorNewline()', () => {
    it('writes a blank stderr line when previous output was non-blank', () => {
      const { logger, stderr } = makeLogger()
      logger.error('first')
      logger.errorNewline()
      // Two newlines minimum: one for 'first', one for the blank.
      expect(stderr.text.split('\n').length).toBeGreaterThan(2)
    })

    it('skips when previous output was already blank', () => {
      const { logger, stderr } = makeLogger()
      logger.errorNewline()
      const before = stderr.text
      logger.errorNewline()
      expect(stderr.text).toBe(before)
    })
  })
})
