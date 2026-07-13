import { describe, expect, it } from 'vitest'

import { Logger } from '../../../src/logger/node'
import { LOG_SYMBOLS } from '../../../src/logger/symbols'

import { LOG_SYMBOLS as canonicalLogSymbols } from '@socketsecurity/lib-stable/logger/symbols'

describe('logger/symbols — LOG_SYMBOLS', () => {
  it('should provide all required symbols', () => {
    expect(LOG_SYMBOLS).toHaveProperty('success')
    expect(LOG_SYMBOLS).toHaveProperty('fail')
    expect(LOG_SYMBOLS).toHaveProperty('warn')
    expect(LOG_SYMBOLS).toHaveProperty('info')
    expect(LOG_SYMBOLS).toHaveProperty('progress')
    expect(LOG_SYMBOLS).toHaveProperty('step')
  })

  it('should return strings for symbols', () => {
    expect(typeof LOG_SYMBOLS['success']).toBe('string')
    expect(typeof LOG_SYMBOLS['fail']).toBe('string')
    expect(typeof LOG_SYMBOLS['warn']).toBe('string')
    expect(typeof LOG_SYMBOLS['info']).toBe('string')
    expect(typeof LOG_SYMBOLS['progress']).toBe('string')
    expect(typeof LOG_SYMBOLS['step']).toBe('string')
  })

  it('should have non-empty symbol strings', () => {
    expect(LOG_SYMBOLS['success']!.length).toBeGreaterThan(0)
    expect(LOG_SYMBOLS['fail']!.length).toBeGreaterThan(0)
    expect(LOG_SYMBOLS['warn']!.length).toBeGreaterThan(0)
    expect(LOG_SYMBOLS['info']!.length).toBeGreaterThan(0)
    expect(LOG_SYMBOLS['progress']!.length).toBeGreaterThan(0)
    expect(LOG_SYMBOLS['step']!.length).toBeGreaterThan(0)
  })

  it('should be accessible from Logger.LOG_SYMBOLS', () => {
    expect(Logger.LOG_SYMBOLS).toEqual(canonicalLogSymbols)
    expect(Logger.LOG_SYMBOLS['success']).toBe(canonicalLogSymbols['success'])
  })

  it('should have progress symbol containing therefore character', () => {
    expect(LOG_SYMBOLS['progress']).toMatch(/[∴:]/)
  })
})
