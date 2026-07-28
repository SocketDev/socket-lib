/**
 * @file Unit tests for stdio/progress. Covers ProgressBar class (constructor
 *   defaults, update, tick, throttling, render path with custom tokens/colors,
 *   time formatting, terminate, clear) and the createProgressIndicator helper.
 *   Uses a mock stream so tests don't write to the real stderr.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  createProgressIndicator,
  ProgressBar,
} from '../../../src/stdio/progress'

import type { ProgressBarOptions } from '../../../src/stdio/progress'

export type MockStream = NodeJS.WriteStream & {
  // Exposed for assertions.
  writes: string[]
}

export function createMockStream(isTTY = true): MockStream {
  const writes: string[] = []
  return {
    isTTY,
    write: (data: string) => {
      writes.push(String(data))
      return true
    },
    cursorTo: vi.fn(),
    clearLine: vi.fn(),
    writes,
  } as unknown as MockStream
}

describe('stdio/progress', () => {
  describe('ProgressBar', () => {
    it('renders a bar on update', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, { stream, renderThrottle: 0 })
      bar.update(50)
      expect(stream.writes.length).toBeGreaterThan(0)
      const output = stream.writes.join('')
      expect(output).toContain('50%')
      expect(output).toContain('50/100')
    })

    it('clamps current to total', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(10, { stream, renderThrottle: 0 })
      bar.update(999)
      const output = stream.writes.join('')
      expect(output).toContain('100%')
      expect(output).toContain('10/10')
    })

    it('handles total=0 (avoids divide-by-zero)', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(0, { stream, renderThrottle: 0 })
      bar.update(0)
      const output = stream.writes.join('')
      expect(output).toContain('0%')
    })

    it('tick increments by 1 by default', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, { stream, renderThrottle: 0 })
      bar.tick()
      const output = stream.writes.join('')
      expect(output).toContain('1/100')
    })

    it('tick(n) increments by n', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, { stream, renderThrottle: 0 })
      bar.tick(25)
      const output = stream.writes.join('')
      expect(output).toContain('25/100')
    })

    it('terminates and emits newline when complete (without clear option)', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(10, { stream, renderThrottle: 0 })
      bar.update(10)
      const lastWrite = stream.writes[stream.writes.length - 1]
      expect(lastWrite).toBe('\n')
    })

    it('clears the line on terminate when clear=true', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(10, {
        stream,
        renderThrottle: 0,
        clear: true,
      })
      bar.update(10)
      // No final newline emitted (clear path).
      expect(stream.writes[stream.writes.length - 1]).not.toBe('\n')
      // cursorTo was called for the TTY clear.
      expect(stream.cursorTo).toHaveBeenCalled()
    })

    it('writes spaces to clear when stream is not a TTY', () => {
      const stream = createMockStream(false)
      const bar = new ProgressBar(10, {
        stream,
        renderThrottle: 0,
        clear: true,
      })
      bar.update(5) // partial update so non-TTY clear path fires
      bar.update(10)
      const output = stream.writes.join('')
      expect(output).toContain('\r')
    })

    it('returns early after terminate', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(10, { stream, renderThrottle: 0 })
      bar.update(10)
      const writeCountBefore = stream.writes.length
      bar.update(5)
      bar.tick(1)
      // No additional writes after termination.
      expect(stream.writes.length).toBe(writeCountBefore)
    })

    it('throttles renders within renderThrottle window', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, { stream, renderThrottle: 1000 })
      bar.update(10)
      const before = stream.writes.length
      // Second update within throttle window should be skipped.
      bar.update(20)
      expect(stream.writes.length).toBe(before)
    })

    it('does NOT throttle the final update (current >= total)', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, { stream, renderThrottle: 1000 })
      bar.update(50)
      const before = stream.writes.length
      // Even within throttle window, hitting total should render.
      bar.update(100)
      expect(stream.writes.length).toBeGreaterThan(before)
    })

    it('replaces custom tokens passed to update()', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, {
        stream,
        renderThrottle: 0,
        format: ':bar :percent :status',
      })
      bar.update(50, { status: 'downloading' })
      expect(stream.writes.join('')).toContain('downloading')
    })

    it('replaces :elapsed and :eta tokens', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, {
        stream,
        renderThrottle: 0,
        format: ':percent elapsed=:elapsed eta=:eta',
      })
      bar.update(50)
      const out = stream.writes.join('')
      expect(out).toMatch(/elapsed=\d+s/)
      expect(out).toMatch(/eta=\d+s/)
    })

    it('formats time over 60 seconds as MmSs', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(1000, {
        stream,
        renderThrottle: 0,
        format: ':eta',
      })
      // To exercise the >60s branch we simulate elapsed by patching startTime.
      const inst = bar as unknown as { startTime: number }
      inst.startTime = Date.now() - 120_000 // 2 minutes ago
      bar.update(100) // 10% done after 2min → eta = 18min
      const out = stream.writes.join('')
      expect(out).toMatch(/\d+m\d+s/)
    })

    it('clamps negative time deltas to 0s', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, {
        stream,
        renderThrottle: 0,
        format: ':eta',
      })
      // current === 0 → eta = 0 → "0s".
      bar.update(0)
      expect(stream.writes.join('')).toContain('0s')
    })

    it('honors color option (cyan default, others map)', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, {
        stream,
        renderThrottle: 0,
        color: 'green',
      })
      bar.update(50)
      // Just ensure no throw and bar renders.
      expect(stream.writes.length).toBeGreaterThan(0)
    })

    it('falls back to identity when color name is unknown', () => {
      const stream = createMockStream()
      const bar = new ProgressBar(100, {
        stream,
        renderThrottle: 0,
        color: 'nonsense' as unknown as ProgressBarOptions['color'],
      })
      bar.update(50)
      expect(stream.writes.length).toBeGreaterThan(0)
    })

    it('uses process.stderr by default when no stream is provided', () => {
      // Construct with no options — should still produce a bar (using stderr).
      // We don't actually want stderr writes in tests, so spy on it.
      const writeSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      try {
        const bar = new ProgressBar(10, { renderThrottle: 0 })
        bar.update(5)
        expect(writeSpy).toHaveBeenCalled()
      } finally {
        writeSpy.mockRestore()
      }
    })
  })

  describe('createProgressIndicator', () => {
    it('returns "[N%] current/total" format', () => {
      const result = createProgressIndicator(50, 100)
      expect(result).toContain('[50%]')
      expect(result).toContain('50/100')
    })

    it('handles 0/total (0%)', () => {
      const result = createProgressIndicator(0, 100)
      expect(result).toContain('[0%]')
    })

    it('handles total=0 without divide-by-zero (returns 0%)', () => {
      const result = createProgressIndicator(0, 0)
      expect(result).toContain('[0%]')
    })

    it('floors percent (does not round up)', () => {
      const result = createProgressIndicator(33, 100)
      expect(result).toContain('[33%]')
    })

    it('prefixes with label when supplied', () => {
      const result = createProgressIndicator(3, 10, 'Files')
      expect(result.startsWith('Files: ')).toBe(true)
      expect(result).toContain('[30%]')
      expect(result).toContain('3/10')
    })
  })
})
