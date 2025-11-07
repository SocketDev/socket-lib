/**
 * @fileoverview Unit tests for stdio output masking utilities.
 *
 * Tests CLI output masking for hiding/showing command output during execution:
 * - createOutputMask() creates mask objects with spinner and buffer control
 * - isSpinning flag indicates whether output should be masked (spinner active)
 * - verbose/showOutput modes to control visibility of underlying command output
 * - outputBuffer stores captured output for later replay
 * - stdoutCapture/stderrCapture track stream data during masking
 * Used by CLI tools to show spinners during long operations then replay output on errors.
 * NOT related to password masking - this is for CLI output visibility control.
 */

import {
  createOutputMask,
  type OutputMaskOptions,
  type OutputMask,
} from '@socketsecurity/lib/stdio/mask'
import { describe, expect, it } from 'vitest'

describe('stdio/mask', () => {
  describe('createOutputMask', () => {
    it('should create mask with default options', () => {
      const mask = createOutputMask()
      expect(mask).toBeDefined()
      expect(mask.isSpinning).toBe(true)
      expect(mask.outputBuffer).toEqual([])
      expect(mask.verbose).toBe(false)
      expect(mask.stdoutCapture).toBe('')
      expect(mask.stderrCapture).toBe('')
    })

    it('should create mask with showOutput true', () => {
      const mask = createOutputMask({ showOutput: true })
      expect(mask.isSpinning).toBe(false)
      expect(mask.verbose).toBe(true)
      expect(mask.outputBuffer).toEqual([])
    })

    it('should create mask with showOutput false', () => {
      const mask = createOutputMask({ showOutput: false })
      expect(mask.isSpinning).toBe(true)
      expect(mask.verbose).toBe(false)
    })

    it('should initialize empty output buffer', () => {
      const mask = createOutputMask()
      expect(Array.isArray(mask.outputBuffer)).toBe(true)
      expect(mask.outputBuffer.length).toBe(0)
    })

    it('should initialize empty capture strings', () => {
      const mask = createOutputMask()
      expect(mask.stdoutCapture).toBe('')
      expect(mask.stderrCapture).toBe('')
    })

    it('should handle empty options object', () => {
      const mask = createOutputMask({})
      expect(mask).toBeDefined()
      expect(mask.verbose).toBe(false)
    })

    it('should handle options with custom message', () => {
      const options: OutputMaskOptions = {
        message: 'Custom progress message',
        showOutput: false,
      }
      const mask = createOutputMask(options)
      expect(mask).toBeDefined()
      expect(mask.isSpinning).toBe(true)
    })

    it('should handle options with toggle text', () => {
      const options: OutputMaskOptions = {
        toggleText: 'custom toggle text',
      }
      const mask = createOutputMask(options)
      expect(mask).toBeDefined()
    })

    it('should handle options with filter function', () => {
      const filterFn = (text: string, _stream: 'stdout' | 'stderr') => {
        return !text.includes('ignore')
      }
      const options: OutputMaskOptions = {
        filterOutput: filterFn,
      }
      const mask = createOutputMask(options)
      expect(mask).toBeDefined()
    })

    it('should handle options with override exit code function', () => {
      const overrideFn = (code: number, _stdout: string, stderr: string) => {
        if (code !== 0 && stderr.includes('non-fatal')) {
          return 0
        }
        return undefined
      }
      const options: OutputMaskOptions = {
        overrideExitCode: overrideFn,
      }
      const mask = createOutputMask(options)
      expect(mask).toBeDefined()
    })

    it('should handle options with cwd', () => {
      const options: OutputMaskOptions = {
        cwd: '/custom/path',
      }
      const mask = createOutputMask(options)
      expect(mask).toBeDefined()
    })

    it('should handle options with env', () => {
      const options: OutputMaskOptions = {
        env: { NODE_ENV: 'test', CUSTOM: 'value' },
      }
      const mask = createOutputMask(options)
      expect(mask).toBeDefined()
    })

    it('should handle all options combined', () => {
      const options: OutputMaskOptions = {
        cwd: '/test',
        env: { TEST: '1' },
        filterOutput: text => !text.includes('skip'),
        message: 'Testing...',
        overrideExitCode: code => (code === 1 ? 0 : undefined),
        showOutput: true,
        toggleText: 'to toggle',
      }
      const mask = createOutputMask(options)
      expect(mask).toBeDefined()
      expect(mask.verbose).toBe(true)
      expect(mask.isSpinning).toBe(false)
    })
  })

  describe('OutputMask type', () => {
    it('should create valid OutputMask object', () => {
      const mask: OutputMask = {
        isSpinning: false,
        outputBuffer: ['line1', 'line2'],
        stderrCapture: 'stderr content',
        stdoutCapture: 'stdout content',
        verbose: true,
      }
      expect(mask.isSpinning).toBe(false)
      expect(mask.outputBuffer).toHaveLength(2)
      expect(mask.stderrCapture).toBe('stderr content')
      expect(mask.stdoutCapture).toBe('stdout content')
      expect(mask.verbose).toBe(true)
    })

    it('should allow empty output buffer', () => {
      const mask: OutputMask = {
        isSpinning: true,
        outputBuffer: [],
        stderrCapture: '',
        stdoutCapture: '',
        verbose: false,
      }
      expect(mask.outputBuffer).toEqual([])
    })

    it('should allow large output buffer', () => {
      const largeBuffer = Array.from({ length: 1000 }, (_, i) => `line ${i}`)
      const mask: OutputMask = {
        isSpinning: false,
        outputBuffer: largeBuffer,
        stderrCapture: '',
        stdoutCapture: '',
        verbose: true,
      }
      expect(mask.outputBuffer).toHaveLength(1000)
    })
  })

  describe('OutputMaskOptions type', () => {
    it('should accept minimal options', () => {
      const options: OutputMaskOptions = {}
      expect(options).toBeDefined()
    })

    it('should accept filter function with correct signature', () => {
      const options: OutputMaskOptions = {
        filterOutput: (text: string, stream: 'stdout' | 'stderr'): boolean => {
          return text.length > 0 && stream === 'stdout'
        },
      }
      expect(options.filterOutput).toBeDefined()
      if (options.filterOutput) {
        expect(options.filterOutput('test', 'stdout')).toBe(true)
        expect(options.filterOutput('test', 'stderr')).toBe(false)
      }
    })

    it('should accept override exit code function', () => {
      const options: OutputMaskOptions = {
        overrideExitCode: (
          code: number,
          _stdout: string,
          stderr: string,
        ): number | undefined => {
          if (code === 1 && stderr.includes('warning')) {
            return 0
          }
          return undefined
        },
      }
      expect(options.overrideExitCode).toBeDefined()
      if (options.overrideExitCode) {
        expect(options.overrideExitCode(1, '', 'warning: test')).toBe(0)
        expect(options.overrideExitCode(1, '', 'error')).toBeUndefined()
      }
    })
  })

  describe('edge cases', () => {
    it('should handle undefined options', () => {
      const mask = createOutputMask(undefined)
      expect(mask).toBeDefined()
      expect(mask.verbose).toBe(false)
    })

    it('should handle partial options', () => {
      const mask = createOutputMask({ message: 'Loading...' })
      expect(mask).toBeDefined()
      expect(mask.isSpinning).toBe(true)
    })
  })

  describe('output buffer behavior', () => {
    it('should start with empty output buffer', () => {
      const mask = createOutputMask()
      expect(mask.outputBuffer).toEqual([])
    })

    it('should allow modification of output buffer', () => {
      const mask = createOutputMask()
      mask.outputBuffer.push('line 1')
      mask.outputBuffer.push('line 2')
      expect(mask.outputBuffer).toHaveLength(2)
      expect(mask.outputBuffer[0]).toBe('line 1')
      expect(mask.outputBuffer[1]).toBe('line 2')
    })

    it('should allow clearing output buffer', () => {
      const mask = createOutputMask()
      mask.outputBuffer.push('test')
      expect(mask.outputBuffer).toHaveLength(1)
      mask.outputBuffer = []
      expect(mask.outputBuffer).toEqual([])
    })
  })

  describe('capture fields', () => {
    it('should start with empty captures', () => {
      const mask = createOutputMask()
      expect(mask.stdoutCapture).toBe('')
      expect(mask.stderrCapture).toBe('')
    })

    it('should allow appending to stdout capture', () => {
      const mask = createOutputMask()
      mask.stdoutCapture += 'stdout line 1\n'
      mask.stdoutCapture += 'stdout line 2\n'
      expect(mask.stdoutCapture).toContain('stdout line 1')
      expect(mask.stdoutCapture).toContain('stdout line 2')
    })

    it('should allow appending to stderr capture', () => {
      const mask = createOutputMask()
      mask.stderrCapture += 'stderr line 1\n'
      mask.stderrCapture += 'stderr line 2\n'
      expect(mask.stderrCapture).toContain('stderr line 1')
      expect(mask.stderrCapture).toContain('stderr line 2')
    })

    it('should handle large captures', () => {
      const mask = createOutputMask()
      const largeString = 'x'.repeat(10_000)
      mask.stdoutCapture = largeString
      expect(mask.stdoutCapture.length).toBe(10_000)
    })

    it('should handle unicode in captures', () => {
      const mask = createOutputMask()
      mask.stdoutCapture = '你好世界 🎉'
      mask.stderrCapture = 'Hëllø Wörld'
      expect(mask.stdoutCapture).toContain('你好世界')
      expect(mask.stdoutCapture).toContain('🎉')
      expect(mask.stderrCapture).toContain('Hëllø')
    })
  })

  describe('spinner state', () => {
    it('should start with isSpinning true by default', () => {
      const mask = createOutputMask()
      expect(mask.isSpinning).toBe(true)
    })

    it('should start with isSpinning false when showOutput is true', () => {
      const mask = createOutputMask({ showOutput: true })
      expect(mask.isSpinning).toBe(false)
    })

    it('should allow toggling isSpinning', () => {
      const mask = createOutputMask()
      expect(mask.isSpinning).toBe(true)
      mask.isSpinning = false
      expect(mask.isSpinning).toBe(false)
      mask.isSpinning = true
      expect(mask.isSpinning).toBe(true)
    })
  })

  describe('verbose mode', () => {
    it('should start with verbose false by default', () => {
      const mask = createOutputMask()
      expect(mask.verbose).toBe(false)
    })

    it('should start with verbose true when showOutput is true', () => {
      const mask = createOutputMask({ showOutput: true })
      expect(mask.verbose).toBe(true)
    })

    it('should allow toggling verbose', () => {
      const mask = createOutputMask()
      expect(mask.verbose).toBe(false)
      mask.verbose = true
      expect(mask.verbose).toBe(true)
      mask.verbose = false
      expect(mask.verbose).toBe(false)
    })

    it('should sync isSpinning and verbose states', () => {
      const mask = createOutputMask({ showOutput: false })
      expect(mask.isSpinning).toBe(true)
      expect(mask.verbose).toBe(false)

      const mask2 = createOutputMask({ showOutput: true })
      expect(mask2.isSpinning).toBe(false)
      expect(mask2.verbose).toBe(true)
    })
  })

  describe('filter function', () => {
    it('should accept filter that filters stdout', () => {
      const filter = (text: string, stream: 'stdout' | 'stderr') => {
        return stream === 'stdout' && !text.includes('skip')
      }
      const mask = createOutputMask({ filterOutput: filter })
      expect(mask).toBeDefined()
    })

    it('should accept filter that filters stderr', () => {
      const filter = (text: string, stream: 'stdout' | 'stderr') => {
        return stream === 'stderr' || !text.includes('ignore')
      }
      const mask = createOutputMask({ filterOutput: filter })
      expect(mask).toBeDefined()
    })

    it('should accept filter based on content', () => {
      const filter = (text: string) => {
        return !text.includes('warning') && !text.includes('deprecated')
      }
      const mask = createOutputMask({ filterOutput: filter })
      expect(mask).toBeDefined()
    })

    it('should accept filter with complex logic', () => {
      const filter = (text: string, stream: 'stdout' | 'stderr') => {
        if (stream === 'stderr' && text.includes('FATAL')) {
          return true
        }
        if (text.includes('debug')) {
          return false
        }
        if (text.length === 0) {
          return false
        }
        return true
      }
      const mask = createOutputMask({ filterOutput: filter })
      expect(mask).toBeDefined()
    })
  })

  describe('override exit code function', () => {
    it('should accept function that returns undefined', () => {
      const override = () => undefined
      const mask = createOutputMask({ overrideExitCode: override })
      expect(mask).toBeDefined()
    })

    it('should accept function that returns number', () => {
      const override = (code: number) => {
        return code === 1 ? 0 : code
      }
      const mask = createOutputMask({ overrideExitCode: override })
      expect(mask).toBeDefined()
    })

    it('should accept function that checks stdout', () => {
      const override = (_code: number, stdout: string) => {
        return stdout.includes('success') ? 0 : undefined
      }
      const mask = createOutputMask({ overrideExitCode: override })
      expect(mask).toBeDefined()
    })

    it('should accept function that checks stderr', () => {
      const override = (code: number, _stdout: string, stderr: string) => {
        if (code !== 0 && stderr.includes('non-fatal')) {
          return 0
        }
        return undefined
      }
      const mask = createOutputMask({ overrideExitCode: override })
      expect(mask).toBeDefined()
    })

    it('should accept function with complex logic', () => {
      const override = (code: number, stdout: string, stderr: string) => {
        const output = stdout + stderr
        if (code === 1 && output.includes('ECONNREFUSED')) {
          return 2
        }
        if (code === 0 && output.includes('FAIL')) {
          return 1
        }
        return undefined
      }
      const mask = createOutputMask({ overrideExitCode: override })
      expect(mask).toBeDefined()
    })
  })

  describe('spawn options', () => {
    it('should accept cwd option', () => {
      const mask = createOutputMask({ cwd: '/tmp' })
      expect(mask).toBeDefined()
    })

    it('should accept env option with single variable', () => {
      const mask = createOutputMask({ env: { NODE_ENV: 'test' } })
      expect(mask).toBeDefined()
    })

    it('should accept env option with multiple variables', () => {
      const mask = createOutputMask({
        env: {
          NODE_ENV: 'test',
          DEBUG: '*',
          PORT: '3000',
        },
      })
      expect(mask).toBeDefined()
    })

    it('should accept empty env object', () => {
      const mask = createOutputMask({ env: {} })
      expect(mask).toBeDefined()
    })

    it('should accept relative cwd', () => {
      const mask = createOutputMask({ cwd: './test' })
      expect(mask).toBeDefined()
    })

    it('should accept absolute cwd', () => {
      const mask = createOutputMask({ cwd: '/absolute/path/to/dir' })
      expect(mask).toBeDefined()
    })
  })

  describe('message and toggle text', () => {
    it('should accept custom message', () => {
      const mask = createOutputMask({ message: 'Installing packages...' })
      expect(mask).toBeDefined()
    })

    it('should accept custom toggle text', () => {
      const mask = createOutputMask({ toggleText: 'for logs' })
      expect(mask).toBeDefined()
    })

    it('should accept both message and toggle text', () => {
      const mask = createOutputMask({
        message: 'Building project',
        toggleText: 'to see compilation output',
      })
      expect(mask).toBeDefined()
    })

    it('should accept empty strings', () => {
      const mask = createOutputMask({
        message: '',
        toggleText: '',
      })
      expect(mask).toBeDefined()
    })

    it('should accept long strings', () => {
      const longMessage = 'x'.repeat(200)
      const mask = createOutputMask({ message: longMessage })
      expect(mask).toBeDefined()
    })
  })

  describe('type validation', () => {
    it('should create mask with all properties defined', () => {
      const mask = createOutputMask()
      expect(mask).toHaveProperty('isSpinning')
      expect(mask).toHaveProperty('outputBuffer')
      expect(mask).toHaveProperty('verbose')
      expect(mask).toHaveProperty('stdoutCapture')
      expect(mask).toHaveProperty('stderrCapture')
    })

    it('should have correct property types', () => {
      const mask = createOutputMask()
      expect(typeof mask.isSpinning).toBe('boolean')
      expect(Array.isArray(mask.outputBuffer)).toBe(true)
      expect(typeof mask.verbose).toBe('boolean')
      expect(typeof mask.stdoutCapture).toBe('string')
      expect(typeof mask.stderrCapture).toBe('string')
    })

    it('should not have extra properties', () => {
      const mask = createOutputMask()
      const keys = Object.keys(mask)
      expect(keys).toHaveLength(5)
      expect(keys).toContain('isSpinning')
      expect(keys).toContain('outputBuffer')
      expect(keys).toContain('verbose')
      expect(keys).toContain('stdoutCapture')
      expect(keys).toContain('stderrCapture')
    })
  })

  describe('option combinations', () => {
    it('should handle message with showOutput', () => {
      const mask = createOutputMask({
        message: 'Test message',
        showOutput: true,
      })
      expect(mask.verbose).toBe(true)
      expect(mask.isSpinning).toBe(false)
    })

    it('should handle filter with showOutput', () => {
      const mask = createOutputMask({
        filterOutput: text => !text.includes('skip'),
        showOutput: false,
      })
      expect(mask.isSpinning).toBe(true)
    })

    it('should handle override with env', () => {
      const mask = createOutputMask({
        overrideExitCode: code => (code === 1 ? 0 : undefined),
        env: { TEST: '1' },
      })
      expect(mask).toBeDefined()
    })

    it('should handle all boolean combinations', () => {
      const mask1 = createOutputMask({ showOutput: false })
      expect(mask1.isSpinning).toBe(true)
      expect(mask1.verbose).toBe(false)

      const mask2 = createOutputMask({ showOutput: true })
      expect(mask2.isSpinning).toBe(false)
      expect(mask2.verbose).toBe(true)
    })
  })
})
