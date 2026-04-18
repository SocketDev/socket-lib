/**
 * @fileoverview Integration tests for stdio output masking utilities.
 *
 * Tests CLI output masking for hiding/showing command output during execution:
 * - createOutputMask() creates mask objects with spinner and buffer control
 * - isSpinning flag indicates whether output should be masked (spinner active)
 * - verbose/showOutput modes to control visibility of underlying command output
 * - outputBuffer / stdoutCapture / stderrCapture are mutable state for runtime use
 *
 * Used by CLI tools to show spinners during long operations and replay output
 * on errors. NOT related to password masking — this is CLI output visibility.
 */

import { describe, expect, it } from 'vitest'

import {
  createOutputMask,
  type OutputMaskOptions,
  type OutputMask,
} from '@socketsecurity/lib/stdio/mask'

describe('stdio/mask', () => {
  describe('createOutputMask defaults', () => {
    it('returns mask with spinning=true, verbose=false, empty state', () => {
      const mask = createOutputMask()
      expect(mask.isSpinning).toBe(true)
      expect(mask.verbose).toBe(false)
      expect(mask.outputBuffer).toEqual([])
      expect(mask.stdoutCapture).toBe('')
      expect(mask.stderrCapture).toBe('')
    })

    it('treats undefined and {} identically', () => {
      const a = createOutputMask(undefined)
      const b = createOutputMask({})
      expect(a).toEqual(b)
    })

    it('exposes exactly the five documented fields', () => {
      const mask = createOutputMask()
      expect(Object.keys(mask).sort()).toEqual([
        'isSpinning',
        'outputBuffer',
        'stderrCapture',
        'stdoutCapture',
        'verbose',
      ])
    })
  })

  describe('createOutputMask showOutput', () => {
    it('showOutput=true inverts both isSpinning and verbose', () => {
      const mask = createOutputMask({ showOutput: true })
      expect(mask.isSpinning).toBe(false)
      expect(mask.verbose).toBe(true)
    })

    it('showOutput=false keeps defaults', () => {
      const mask = createOutputMask({ showOutput: false })
      expect(mask.isSpinning).toBe(true)
      expect(mask.verbose).toBe(false)
    })
  })

  describe('createOutputMask accepts options without throwing', () => {
    // These options (cwd/env/message/toggleText/filterOutput/overrideExitCode)
    // are consumed by attachOutputMask/runWithMask when spawning, not stored on
    // the returned mask object. The factory's only contract is "doesn't throw
    // for a valid shape" — verified here with a table of representative inputs.
    const cases: Array<[string, OutputMaskOptions]> = [
      ['cwd', { cwd: '/tmp' }],
      ['env single var', { env: { NODE_ENV: 'test' } }],
      ['env multiple vars', { env: { NODE_ENV: 'test', DEBUG: '*' } }],
      ['message', { message: 'Installing packages...' }],
      ['toggleText', { toggleText: 'for logs' }],
      ['filterOutput', { filterOutput: t => !t.includes('skip') }],
      [
        'overrideExitCode',
        { overrideExitCode: c => (c === 1 ? 0 : undefined) },
      ],
      [
        'all combined',
        {
          cwd: '/test',
          env: { TEST: '1' },
          filterOutput: t => !t.includes('skip'),
          message: 'Testing',
          overrideExitCode: c => (c === 1 ? 0 : undefined),
          showOutput: true,
          toggleText: 'toggle',
        },
      ],
    ]

    it.each(cases)('accepts %s option without throwing', (_name, options) => {
      expect(() => createOutputMask(options)).not.toThrow()
    })
  })

  describe('filterOutput callback contract', () => {
    it('filter receives (text, stream) and its return value is used directly', () => {
      const filter = (text: string, stream: 'stdout' | 'stderr'): boolean => {
        return text.length > 0 && stream === 'stdout'
      }
      const options: OutputMaskOptions = { filterOutput: filter }
      expect(options.filterOutput?.('test', 'stdout')).toBe(true)
      expect(options.filterOutput?.('test', 'stderr')).toBe(false)
      expect(options.filterOutput?.('', 'stdout')).toBe(false)
    })
  })

  describe('overrideExitCode callback contract', () => {
    it('override receives (code, stdout, stderr) and may return a new code or undefined', () => {
      const override = (
        code: number,
        _stdout: string,
        stderr: string,
      ): number | undefined => {
        if (code === 1 && stderr.includes('warning')) {
          return 0
        }
        return undefined
      }
      const options: OutputMaskOptions = { overrideExitCode: override }
      expect(options.overrideExitCode?.(1, '', 'warning: x')).toBe(0)
      expect(options.overrideExitCode?.(1, '', 'real error')).toBeUndefined()
      expect(options.overrideExitCode?.(0, '', '')).toBeUndefined()
    })
  })

  describe('mutable state on returned mask', () => {
    it('outputBuffer is mutable — callers append to it during streaming', () => {
      const mask = createOutputMask()
      mask.outputBuffer.push('line 1')
      mask.outputBuffer.push('line 2')
      expect(mask.outputBuffer).toEqual(['line 1', 'line 2'])
      mask.outputBuffer = []
      expect(mask.outputBuffer).toEqual([])
    })

    it('stdoutCapture and stderrCapture accumulate as strings', () => {
      const mask = createOutputMask()
      mask.stdoutCapture += 'a\n'
      mask.stdoutCapture += 'b\n'
      mask.stderrCapture = 'err'
      expect(mask.stdoutCapture).toBe('a\nb\n')
      expect(mask.stderrCapture).toBe('err')
    })

    it('handles unicode in captures without corruption', () => {
      const mask = createOutputMask()
      mask.stdoutCapture = '你好世界 🎉'
      expect(mask.stdoutCapture).toBe('你好世界 🎉')
    })

    it('isSpinning and verbose are independently toggleable', () => {
      const mask = createOutputMask()
      mask.isSpinning = false
      mask.verbose = true
      expect(mask.isSpinning).toBe(false)
      expect(mask.verbose).toBe(true)
    })
  })

  describe('OutputMask type shape', () => {
    it('compiles with all fields required', () => {
      const mask: OutputMask = {
        isSpinning: false,
        outputBuffer: ['x'],
        stderrCapture: 'e',
        stdoutCapture: 's',
        verbose: true,
      }
      expect(mask.outputBuffer).toHaveLength(1)
    })
  })
})
