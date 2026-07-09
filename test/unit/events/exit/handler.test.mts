import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onExit } from '../../../../src/events/exit/handler'
import { unload } from '../../../../src/events/exit/lifecycle'
import { signals } from '../../../../src/events/exit/signals'

beforeEach(() => {
  unload()
})

afterEach(() => {
  unload()
})

describe('events/exit/handler — onExit', () => {
  it('registers exit handler', () => {
    const callback = vi.fn()
    const remove = onExit(callback)
    expect(typeof remove).toBe('function')
  })

  it('auto-loads if not already loaded', () => {
    unload()
    const callback = vi.fn()
    onExit(callback)
    expect(signals()).toBeTruthy()
  })

  it('returns removal function', () => {
    const callback = vi.fn()
    const remove = onExit(callback)
    expect(typeof remove).toBe('function')
    expect(() => remove()).not.toThrow()
  })

  it('handles alwaysLast option', () => {
    const callback = vi.fn()
    const remove = onExit(callback, { alwaysLast: true })
    expect(typeof remove).toBe('function')
    remove()
  })

  it('handles alwaysLast: false option', () => {
    const callback = vi.fn()
    const remove = onExit(callback, { alwaysLast: false })
    expect(typeof remove).toBe('function')
    remove()
  })

  it('handles undefined options', () => {
    const callback = vi.fn()
    const remove = onExit(callback, undefined)
    expect(typeof remove).toBe('function')
    remove()
  })

  it('throws TypeError for non-function callback', () => {
    type ExitCallback = Parameters<typeof onExit>[0]
    expect(() => onExit(undefined as unknown as ExitCallback)).toThrow(
      TypeError,
    )
    expect(() => onExit(undefined as unknown as ExitCallback)).toThrow(
      TypeError,
    )
    expect(() => onExit(42 as unknown as ExitCallback)).toThrow(TypeError)
    expect(() => onExit('string' as unknown as ExitCallback)).toThrow(TypeError)
  })

  it('allows multiple handlers', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()
    const callback3 = vi.fn()

    const remove1 = onExit(callback1)
    const remove2 = onExit(callback2)
    const remove3 = onExit(callback3)

    expect(typeof remove1).toBe('function')
    expect(typeof remove2).toBe('function')
    expect(typeof remove3).toBe('function')

    remove1()
    remove2()
    remove3()
  })

  it('handles removal of handlers', () => {
    const callback = vi.fn()
    const remove = onExit(callback)
    remove()
    expect(() => remove()).not.toThrow()
  })

  it('unloads when all handlers removed', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    const remove1 = onExit(callback1)
    const remove2 = onExit(callback2)

    expect(() => {
      remove1()
      remove2()
    }).not.toThrow()
  })
})

describe('events/exit/handler — edge cases', () => {
  it('handles multiple handlers with same callback', () => {
    const callback = vi.fn()
    const remove1 = onExit(callback)
    const remove2 = onExit(callback)

    expect(() => {
      remove1()
      remove2()
    }).not.toThrow()
  })
})

describe('events/exit/handler — error handling', () => {
  it('handles errors in callback gracefully', () => {
    const errorCallback = vi.fn(() => {
      throw new Error('Test error')
    })

    const remove = onExit(errorCallback)
    expect(typeof remove).toBe('function')
    remove()
  })

  it('handles removal of non-existent handler', () => {
    const callback = vi.fn()
    const remove = onExit(callback)
    expect(() => {
      remove()
      remove()
      remove()
    }).not.toThrow()
  })
})

describe('events/exit/handler — memory management', () => {
  it('does not leak handlers', () => {
    const handlers: Array<() => void> = []
    for (let i = 0; i < 100; i++) {
      const callback = vi.fn()
      const remove = onExit(callback)
      handlers.push(remove)
    }

    expect(() => {
      for (let i = 0, { length } = handlers; i < length; i += 1) {
        const remove = handlers[i]!
        remove()
      }
    }).not.toThrow()
  })

  it('handles handler removal in any order', () => {
    const callbacks = Array.from({ length: 10 }, () => vi.fn())
    const removers = callbacks.map(cb => onExit(cb))

    expect(() => {
      for (let i = removers.length - 1; i >= 0; i--) {
        removers[i]?.()
      }
    }).not.toThrow()
  })
})
