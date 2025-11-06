/**
 * @fileoverview Environment variable rewiring utilities for testing.
 * Uses AsyncLocalStorage for context-isolated overrides that work with concurrent tests.
 *
 * Features:
 * - Context-isolated overrides via withEnv() for advanced use cases
 * - Test-friendly setEnv/clearEnv/resetEnv that work in beforeEach/afterEach
 * - Compatible with vi.stubEnv() - reads from process.env as final fallback
 * - Thread-safe for concurrent test execution
 */

import { AsyncLocalStorage } from 'async_hooks'

import { envAsBoolean } from '#env/helpers'

type EnvOverrides = Map<string, string | undefined>

// Isolated execution context storage for nested overrides (withEnv/withEnvSync)
// AsyncLocalStorage creates isolated contexts that don't leak between concurrent code
const isolatedOverridesStorage = new AsyncLocalStorage<EnvOverrides>()

// Shared test hook overrides (setEnv/clearEnv/resetEnv in beforeEach/afterEach)
// IMPORTANT: Use globalThis to ensure singleton across duplicate module instances
// In coverage mode, both src and dist versions of this module may be loaded,
// but they must share the same Map for rewiring to work.
// Only initialize in test environment to avoid polluting production runtime
// Vitest automatically sets VITEST=true when running tests
const sharedOverridesSymbol = Symbol.for(
  '@socketsecurity/lib/env/rewire/test-overrides',
)
const isVitestEnv = envAsBoolean(process.env.VITEST)
if (isVitestEnv && !globalThis[sharedOverridesSymbol]) {
  globalThis[sharedOverridesSymbol] = new Map<string, string | undefined>()
}
const sharedOverrides: Map<string, string | undefined> | undefined =
  globalThis[sharedOverridesSymbol]

/**
 * Get an environment variable value, checking overrides first.
 *
 * Resolution order:
 * 1. Isolated overrides (temporary - set via withEnv/withEnvSync)
 * 2. Shared overrides (persistent - set via setEnv in beforeEach)
 * 3. process.env (including vi.stubEnv modifications)
 *
 * @internal Used by env getters to support test rewiring
 */
export function getEnvValue(key: string): string | undefined {
  // Check isolated overrides first (highest priority - temporary via withEnv)
  const isolatedOverrides = isolatedOverridesStorage.getStore()
  if (isolatedOverrides?.has(key)) {
    return isolatedOverrides.get(key)
  }

  // Check shared overrides (persistent via setEnv in beforeEach)
  if (sharedOverrides?.has(key)) {
    return sharedOverrides.get(key)
  }

  // Fall back to process.env (works with vi.stubEnv)
  return process.env[key]
}

/**
 * Set an environment variable override for testing.
 * This does not modify process.env, only affects env getters.
 *
 * Works in test hooks (beforeEach) without needing AsyncLocalStorage context.
 * Vitest's module isolation ensures each test file has independent overrides.
 *
 * @example
 * ```typescript
 * import { setEnv, resetEnv } from '#env/rewire'
 * import { getCI } from '#env/ci'
 *
 * beforeEach(() => {
 *   setEnv('CI', '1')
 * })
 *
 * afterEach(() => {
 *   resetEnv()
 * })
 *
 * it('should detect CI environment', () => {
 *   expect(getCI()).toBe(true)
 * })
 * ```
 */
export function setEnv(key: string, value: string | undefined): void {
  sharedOverrides?.set(key, value)
}

/**
 * Clear a specific environment variable override.
 */
export function clearEnv(key: string): void {
  sharedOverrides?.delete(key)
}

/**
 * Clear all environment variable overrides.
 * Useful in afterEach hooks to ensure clean test state.
 *
 * @example
 * ```typescript
 * import { resetEnv } from '#env/rewire'
 *
 * afterEach(() => {
 *   resetEnv()
 * })
 * ```
 */
export function resetEnv(): void {
  sharedOverrides?.clear()
}

/**
 * Check if an environment variable has been overridden.
 */
export function hasOverride(key: string): boolean {
  const isolatedOverrides = isolatedOverridesStorage.getStore()
  return !!(isolatedOverrides?.has(key) || sharedOverrides?.has(key))
}

/**
 * Run code with environment overrides in an isolated AsyncLocalStorage context.
 * Creates true context isolation - overrides don't leak to concurrent code.
 *
 * Useful for tests that need temporary overrides without affecting other tests
 * or for nested override scenarios.
 *
 * @example
 * ```typescript
 * import { withEnv } from '#env/rewire'
 * import { getCI } from '#env/ci'
 *
 * // Temporary override in isolated context
 * await withEnv({ CI: '1' }, async () => {
 *   expect(getCI()).toBe(true)
 * })
 * expect(getCI()).toBe(false) // Override is gone
 * ```
 *
 * @example
 * ```typescript
 * // Nested overrides work correctly
 * setEnv('CI', '1') // Shared override (persistent)
 *
 * await withEnv({ CI: '0' }, async () => {
 *   expect(getCI()).toBe(false) // Isolated override takes precedence
 * })
 *
 * expect(getCI()).toBe(true) // Back to shared override
 * ```
 */
export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const map = new Map(Object.entries(overrides))
  return await isolatedOverridesStorage.run(map, fn)
}

/**
 * Synchronous version of withEnv for non-async code.
 *
 * @example
 * ```typescript
 * import { withEnvSync } from '#env/rewire'
 * import { getCI } from '#env/ci'
 *
 * const result = withEnvSync({ CI: '1' }, () => {
 *   return getCI()
 * })
 * expect(result).toBe(true)
 * ```
 */
export function withEnvSync<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T,
): T {
  const map = new Map(Object.entries(overrides))
  return isolatedOverridesStorage.run(map, fn)
}
