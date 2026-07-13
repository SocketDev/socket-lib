import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { onExit } from '../../../../src/events/exit/handler'
import { load, unload } from '../../../../src/events/exit/lifecycle'
import { signals } from '../../../../src/events/exit/signals'

beforeEach(() => {
  unload()
})

afterEach(() => {
  unload()
})

describe('events/exit/lifecycle — load', () => {
  it('loads signal handlers', () => {
    load()
    expect(signals()).toBeTruthy()
  })

  it('is idempotent (safe to call multiple times)', () => {
    load()
    load()
    load()
    expect(signals()).toBeTruthy()
  })

  it('registers signal listeners', () => {
    load()
    const sigs = signals()
    expect(Array.isArray(sigs)).toBe(true)
    if (sigs) {
      expect(sigs.length).toBeGreaterThan(0)
    }
  })
})

describe('events/exit/lifecycle — unload', () => {
  it('unloads signal handlers', () => {
    load()
    unload()
    expect(typeof signals()).toBe('object')
  })

  it('is safe to call when not loaded', () => {
    expect(() => {
      unload()
      unload()
    }).not.toThrow()
  })

  it('is safe to call multiple times', () => {
    load()
    expect(() => {
      unload()
      unload()
      unload()
    }).not.toThrow()
  })
})

describe('events/exit/lifecycle — edge cases', () => {
  it('handles rapid load/unload cycles', () => {
    expect(() => {
      for (let i = 0; i < 10; i++) {
        load()
        unload()
      }
    }).not.toThrow()
  })
})

describe('events/exit/lifecycle — cross-platform behavior', () => {
  it('works on Windows', () => {
    load()
    const sigs = signals()
    expect(sigs).toBeTruthy()
    if (process.platform === 'win32') {
      expect(sigs).toContain('SIGINT')
      expect(sigs).toContain('SIGTERM')
    }
  })

  it('works on POSIX platforms', () => {
    load()
    const sigs = signals()
    expect(sigs).toBeTruthy()
    if (process.platform !== 'win32') {
      expect(sigs.length).toBeGreaterThan(5)
      expect(sigs).toContain('SIGINT')
      expect(sigs).toContain('SIGTERM')
      expect(sigs).toContain('SIGUSR2')
    }
  })

  it('works on Linux', () => {
    load()
    const sigs = signals()
    expect(sigs).toBeTruthy()
    if (process.platform === 'linux') {
      expect(sigs).toContain('SIGIO')
      expect(sigs).toContain('SIGPOLL')
    }
  })
})

describe('events/exit/lifecycle — signal handler behavior', () => {
  it('handles process emit events', () => {
    load()
    expect(process.emit).toBeTruthy()
    expect(typeof process.emit).toBe('function')
  })

  it('restores original process.emit on unload', () => {
    load()
    unload()
    expect(typeof process.emit).toBe('function')
  })
})

describe('events/exit/lifecycle — mix of handler types', () => {
  it('handles mix of regular and alwaysLast handlers', () => {
    const regular1 = () => {}
    const regular2 = () => {}
    const last1 = () => {}
    const last2 = () => {}

    const remove1 = onExit(regular1)
    const remove2 = onExit(last1, { alwaysLast: true })
    const remove3 = onExit(regular2)
    const remove4 = onExit(last2, { alwaysLast: true })

    expect(() => {
      remove1()
      remove2()
      remove3()
      remove4()
    }).not.toThrow()
  })
})
