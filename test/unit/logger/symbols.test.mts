import { describe, expect, it } from 'vitest'

import { Logger } from '../../../src/logger/node.mjs'
import { LOG_SYMBOLS } from '../../../src/logger/symbols.mjs'

/*
 * Color is a property of the destination stream, so the escapes wrapping a
 * symbol differ between a terminal and a redirected stream. The logger and
 * symbol module must expose the same glyphs.
 */
function stripColor(text: string): string {
  return text.replaceAll(/\u001B\[\d+m/g, '')
}

function stripColorValues(
  symbols: Record<string, string | undefined>,
): Record<string, string> {
  const stripped: Record<string, string> = {}
  const keys = Object.keys(symbols)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    const value = symbols[key]
    if (value !== undefined) {
      stripped[key] = stripColor(value)
    }
  }
  return stripped
}

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
    expect(stripColorValues(Logger.LOG_SYMBOLS)).toMatchObject({
      info: expect.stringMatching(/^[ⓘi]$/),
      success: expect.stringMatching(/^[✔√]$/),
    })
  })

  it('should have progress symbol containing therefore character', () => {
    expect(LOG_SYMBOLS['progress']).toMatch(/[∴:]/)
  })
})
