/**
 * @file Unit tests for spinner/default.ts — `getCliSpinners` registry +
 *   `getDefaultSpinner` lazy singleton.
 */

import { describe, expect, it } from 'vitest'

import { getCliSpinners, getDefaultSpinner } from '../../../src/spinner/default'

describe.sequential('spinner/default — getCliSpinners', () => {
  it('returns the full spinner registry when no name is passed', () => {
    const all = getCliSpinners()
    expect(typeof all).toBe('object')
    expect(all).not.toBeNull()
    // The registry must include Socket's custom spinner.
    expect((all as Record<string, unknown>)['socket']).toBeDefined()
  })

  it('returns the custom socket style by name', () => {
    const socket = getCliSpinners('socket')
    expect(socket).toBeDefined()
    expect((socket as { frames?: unknown[] }).frames?.length).toBeGreaterThan(0)
  })

  it('returns undefined for an unknown style name', () => {
    expect(getCliSpinners('does-not-exist-zzz')).toBeUndefined()
  })

  it('memoizes the registry across calls (same reference)', () => {
    const a = getCliSpinners()
    const b = getCliSpinners()
    expect(b).toBe(a)
  })
})

describe.sequential('spinner/default — getDefaultSpinner', () => {
  it('returns a SpinnerInstance', () => {
    const sp = getDefaultSpinner()
    expect(typeof sp).toBe('object')
    expect(typeof (sp as { start?: unknown }).start).toBe('function')
    expect(typeof (sp as { stop?: unknown }).stop).toBe('function')
  })

  it('returns the same instance across calls (singleton)', () => {
    const a = getDefaultSpinner()
    const b = getDefaultSpinner()
    expect(b).toBe(a)
  })
})
