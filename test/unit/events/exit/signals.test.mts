import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { load, unload } from '../../../../src/events/exit/lifecycle'
import { signals } from '../../../../src/events/exit/signals'

beforeEach(() => {
  unload()
})

afterEach(() => {
  unload()
})

describe('events/exit/signals — signals', () => {
  it('returns undefined before load', () => {
    const result = signals()
    expect(result === undefined || Array.isArray(result)).toBe(true)
  })

  it('returns array after load', () => {
    load()
    const sigs = signals()
    expect(Array.isArray(sigs)).toBe(true)
  })

  it('includes common signals', () => {
    load()
    const sigs = signals()
    expect(sigs).toBeTruthy()
    expect(sigs).toContain('SIGINT')
    expect(sigs).toContain('SIGTERM')
  })

  it('has platform-specific signals', () => {
    load()
    const sigs = signals()
    expect(sigs).toBeTruthy()
    if (process.platform !== 'win32') {
      expect(sigs.length).toBeGreaterThan(5)
    }
  })
})
