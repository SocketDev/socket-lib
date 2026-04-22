/**
 * @fileoverview Unit tests for `parseSchema` — the throwing twin of
 * `validateSchema`, used for fail-fast trust boundaries.
 */

import * as zodV3 from 'zod/v3'
import { describe, expect, it } from 'vitest'

import { parseSchema } from '@socketsecurity/lib/schema/parse'

describe('schema/parse', () => {
  it('returns the typed value for valid input', () => {
    const Config = zodV3.object({
      host: zodV3.string(),
      port: zodV3.number(),
    })
    const value = parseSchema(Config, { host: 'localhost', port: 3000 })
    expect(value).toEqual({ host: 'localhost', port: 3000 })
  })

  it('throws an Error whose message summarizes all issues', () => {
    const Config = zodV3.object({
      host: zodV3.string(),
      port: zodV3.number(),
    })
    expect(() => parseSchema(Config, { host: 42, port: 'oops' })).toThrow(Error)
    try {
      parseSchema(Config, { host: 42, port: 'oops' })
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      const msg = (e as Error).message
      expect(msg).toMatch(/^Validation failed:/)
      // Both field names should appear in the summary.
      expect(msg).toContain('host')
      expect(msg).toContain('port')
    }
  })

  it('formats root-level errors as "(root)"', () => {
    const fakeSchema = {
      safeParse: () => ({
        success: false as const,
        error: {
          issues: [{ path: [], message: 'must be a number' }],
        },
      }),
    }
    expect(() => parseSchema(fakeSchema, 'x')).toThrow(
      /Validation failed: \(root\): must be a number/,
    )
  })

  it('joins nested path segments with dots', () => {
    const fakeSchema = {
      safeParse: () => ({
        success: false as const,
        error: {
          issues: [
            { path: ['user', 'name'], message: 'required' },
            { path: ['user', 'age'], message: 'must be positive' },
          ],
        },
      }),
    }
    try {
      parseSchema(fakeSchema, {})
      // Force failure if no throw.
      expect.fail('parseSchema should have thrown')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('user.name: required')
      expect(msg).toContain('user.age: must be positive')
    }
  })

  it('propagates TypeError for unsupported schema (not a validation error)', () => {
    expect(() => parseSchema(null, 'x')).toThrow(TypeError)
  })
})
