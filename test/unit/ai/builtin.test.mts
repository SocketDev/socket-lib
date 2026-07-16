/**
 * @file Contract tests for the cross-runtime built-in AI resolver. The browser
 *   LanguageModel global must win without touching Node, then `node:smol-ai`,
 *   then the optional stock-Node addon package.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { isNodeBuiltin, requireBuiltin } = vi.hoisted(() => ({
  isNodeBuiltin: vi.fn(),
  requireBuiltin: vi.fn(),
}))

vi.mock(import('../../../src/node/module'), () => ({
  isNodeBuiltin,
  requireBuiltin,
}))

interface TestFactory {
  availability(): Promise<'available'>
  create(): Promise<{ readonly id: string }>
}

const originalLanguageModel = Object.getOwnPropertyDescriptor(
  globalThis,
  'LanguageModel',
)

function factory(id: string): TestFactory {
  return {
    async availability() {
      return 'available'
    },
    async create() {
      return { id }
    },
  }
}

function setBrowserFactory(value?: unknown): void {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, 'LanguageModel')
    return
  }
  Object.defineProperty(globalThis, 'LanguageModel', {
    configurable: true,
    value,
  })
}

async function loadResolver() {
  return await import('../../../src/ai/builtin.mts')
}

beforeEach(() => {
  vi.resetModules()
  isNodeBuiltin.mockReset().mockReturnValue(false)
  requireBuiltin.mockReset().mockReturnValue(undefined)
  setBrowserFactory()
})

afterEach(() => {
  if (originalLanguageModel) {
    Object.defineProperty(globalThis, 'LanguageModel', originalLanguageModel)
  } else {
    setBrowserFactory()
  }
})

describe.sequential('getLanguageModel', () => {
  it('returns the browser global without probing Node', async () => {
    const browser = factory('browser')
    setBrowserFactory(browser)

    const { getLanguageModel } = await loadResolver()

    expect(getLanguageModel()).toBe(browser)
    expect(isNodeBuiltin).not.toHaveBeenCalled()
    expect(requireBuiltin).not.toHaveBeenCalled()
  })

  it('prefers node:smol-ai over the npm package', async () => {
    const builtin = factory('builtin')
    isNodeBuiltin.mockImplementation(specifier => specifier === 'node:smol-ai')
    requireBuiltin.mockImplementation(specifier => {
      if (specifier === 'node:smol-ai') {
        return { LanguageModel: builtin }
      }
      throw new Error(`Unexpected package probe: ${specifier}`)
    })

    const { getLanguageModel } = await loadResolver()

    expect(getLanguageModel()).toBe(builtin)
    expect(requireBuiltin).toHaveBeenCalledOnce()
    expect(requireBuiltin).toHaveBeenCalledWith('node:smol-ai')
  })

  it('uses @node-smol/ai after the browser and builtin miss', async () => {
    const addon = factory('addon')
    requireBuiltin.mockReturnValue({ LanguageModel: addon })

    const { getLanguageModel } = await loadResolver()

    expect(getLanguageModel()).toBe(addon)
    expect(isNodeBuiltin).toHaveBeenCalledWith('node:smol-ai')
    expect(requireBuiltin).toHaveBeenCalledWith('@node-smol/ai')
  })

  it('normalizes direct, named, and default exports, preferring named', async () => {
    const named = factory('named')
    const fallback = factory('default')
    requireBuiltin.mockReturnValue({
      default: fallback,
      LanguageModel: named,
    })

    const first = await loadResolver()
    expect(first.getLanguageModel()).toBe(named)

    vi.resetModules()
    requireBuiltin.mockReturnValue({ default: fallback })
    const second = await loadResolver()
    expect(second.getLanguageModel()).toBe(fallback)

    vi.resetModules()
    requireBuiltin.mockReturnValue(fallback)
    const third = await loadResolver()
    expect(third.getLanguageModel()).toBe(fallback)
  })

  it('ignores malformed candidates and returns undefined when all are absent', async () => {
    setBrowserFactory({ availability: 'available', create: vi.fn() })
    requireBuiltin.mockReturnValue({ default: { create: vi.fn() } })

    const { getLanguageModel } = await loadResolver()

    expect(getLanguageModel()).toBe(undefined)
  })

  it('caches an unavailable probe', async () => {
    const { getLanguageModel } = await loadResolver()

    expect(getLanguageModel()).toBe(undefined)
    expect(getLanguageModel()).toBe(undefined)
    expect(isNodeBuiltin).toHaveBeenCalledOnce()
    expect(requireBuiltin).toHaveBeenCalledOnce()
  })

  it('swallows only an exact missing optional-package error', async () => {
    const missing = Object.assign(
      new Error("Cannot find module '@node-smol/ai'"),
      { code: 'MODULE_NOT_FOUND' },
    )
    requireBuiltin.mockImplementation(() => {
      throw missing
    })

    const first = await loadResolver()
    expect(first.getLanguageModel()).toBe(undefined)

    vi.resetModules()
    const initializationError = Object.assign(
      new Error("Cannot find module 'native-helper'"),
      { code: 'MODULE_NOT_FOUND' },
    )
    requireBuiltin.mockImplementation(() => {
      throw initializationError
    })
    const second = await loadResolver()
    expect(() => second.getLanguageModel()).toThrow(initializationError)
  })
})
