/**
 * @file Environment variable rewiring utilities for testing. Uses
 *   AsyncLocalStorage for context-isolated overrides that work with concurrent
 *   tests. Features:
 *
 *   - Context-isolated overrides via withEnv() for advanced use cases
 *   - Test-friendly setEnv/clearEnv/resetEnv that work in beforeEach/afterEach
 *   - Compatible with vi.stubEnv() - reads from process.env as final fallback
 *   - Thread-safe for concurrent test execution
 */

import type { AsyncLocalStorage } from 'node:async_hooks'

import { IS_NODE } from '../constants/runtime'
import { hasOwn } from '../objects/predicates'
import { envAsBoolean } from './boolean'
import { getNodeAsyncHooks } from '../node/async-hooks'

import { MapCtor } from '../primordials/map-set'

import { ObjectEntries } from '../primordials/object'

export type EnvOverrides = Map<string, string | undefined>

// Isolated execution context storage for nested overrides (withEnv/withEnvSync).
// AsyncLocalStorage creates isolated contexts that don't leak between concurrent
// code. Construction is DEFERRED to first use (see getIsolatedOverridesStorage
// below) to keep module import snapshot-safe.
let isolatedOverridesStorage: AsyncLocalStorage<EnvOverrides> | undefined

// Shared test hook overrides (setEnv/clearEnv/resetEnv in beforeEach/afterEach)
// IMPORTANT: Use globalThis to ensure singleton across duplicate module instances
// In coverage mode, both src and dist versions of this module may be loaded,
// but they must share the same Map for rewiring to work.
// Only initialize in test environment to avoid polluting production runtime
// Vitest automatically sets VITEST=true when running tests
const sharedOverridesSymbol = Symbol.for(
  '@socketsecurity/lib/env/rewire/test-overrides',
)
const globalThisRef = globalThis as Record<symbol, unknown>
const isVitestEnv = envAsBoolean(safeProcessEnv()?.['VITEST'])
if (isVitestEnv && !globalThisRef[sharedOverridesSymbol]) {
  globalThisRef[sharedOverridesSymbol] = new MapCtor<
    string,
    string | undefined
  >()
}
const sharedOverrides: Map<string, string | undefined> | undefined =
  globalThisRef[sharedOverridesSymbol] as
    | Map<string, string | undefined>
    | undefined

/**
 * Clear a specific environment variable override.
 *
 * @example
 *   ;```typescript
 *   import { setEnv, clearEnv } from '@socketsecurity/lib/env/rewire'
 *
 *   setEnv('CI', '1')
 *   clearEnv('CI')
 *   ```
 *
 * @param key - The environment variable name to clear.
 */
export function clearEnv(key: string): void {
  sharedOverrides?.delete(key)
}

/**
 * Lazily load the async_hooks module. Aliases the canonical `node/async-hooks`
 * accessor (single owner of the bundler-safe require); kept as an export so
 * this module's surface is unchanged.
 *
 * @private
 */
export const getAsyncHooks = getNodeAsyncHooks

/**
 * Get an environment variable value, checking overrides first.
 *
 * Resolution order: 1. Isolated overrides (temporary - set via
 * withEnv/withEnvSync) 2. Shared overrides (persistent - set via setEnv in
 * beforeEach) 3. process.env (including vi.stubEnv modifications)
 *
 * @example
 *   ;```typescript
 *   import { getEnvValue } from '@socketsecurity/lib/env/rewire'
 *
 *   const value = getEnvValue('NODE_ENV')
 *   // e.g. 'production' or undefined
 *   ```
 *
 * @internal Used by env getters to support test rewiring
 */
export function getEnvValue(key: string): string | undefined {
  // Check isolated overrides first (highest priority - temporary via withEnv)
  const isolatedOverrides = getIsolatedOverrides()
  if (isolatedOverrides?.has(key)) {
    return isolatedOverrides.get(key)
  }

  // Check shared overrides (persistent via setEnv in beforeEach)
  if (sharedOverrides?.has(key)) {
    return sharedOverrides.get(key)
  }

  // Fall back to process.env (works with vi.stubEnv)
  return safeProcessEnv()?.[key]
}

/**
 * Get the current isolated-override map, or undefined when none is active.
 * Off Node (browser bundles) there is no AsyncLocalStorage and no isolated
 * context — env getters fall straight through to the other tiers.
 *
 * @private
 */
export function getIsolatedOverrides(): EnvOverrides | undefined {
  return IS_NODE ? getIsolatedOverridesStorage().getStore() : undefined
}

/**
 * Get the process-scoped AsyncLocalStorage used for nested env overrides
 * (withEnv/withEnvSync).
 *
 * Constructed LAZILY (memoized) rather than at module-eval: an
 * AsyncLocalStorage holds a live native handle, and constructing it at import
 * time pins that handle into every module transitively importing this leaf —
 * aborting V8 --build-snapshot serialization. Deferring to first use keeps the
 * single-store semantics while leaving module import snapshot-safe.
 *
 * @private
 */
export function getIsolatedOverridesStorage(): AsyncLocalStorage<EnvOverrides> {
  if (isolatedOverridesStorage === undefined) {
    const { AsyncLocalStorage } = getNodeAsyncHooks()
    isolatedOverridesStorage = new AsyncLocalStorage<EnvOverrides>()
  }
  return isolatedOverridesStorage
}

/**
 * Check if an environment variable has been overridden.
 *
 * @example
 *   ;```typescript
 *   import { setEnv, hasOverride } from '@socketsecurity/lib/env/rewire'
 *
 *   hasOverride('CI') // false
 *   setEnv('CI', '1')
 *   hasOverride('CI') // true
 *   ```
 *
 * @param key - The environment variable name to check.
 *
 * @returns `true` if the variable has been overridden, `false` otherwise
 */
export function hasOverride(key: string): boolean {
  const isolatedOverrides = getIsolatedOverrides()
  return !!(isolatedOverrides?.has(key) || sharedOverrides?.has(key))
}

/**
 * Check if an environment variable exists (has a key), checking overrides
 * first.
 *
 * Resolution order: 1. Isolated overrides (temporary - set via
 * withEnv/withEnvSync) 2. Shared overrides (persistent - set via setEnv in
 * beforeEach) 3. process.env (including vi.stubEnv modifications)
 *
 * @example
 *   ;```typescript
 *   import { isInEnv } from '@socketsecurity/lib/env/rewire'
 *
 *   isInEnv('PATH') // true (usually set)
 *   isInEnv('MISSING') // false
 *   ```
 *
 * @internal Used by env getters to check for key presence (not value truthiness)
 */
export function isInEnv(key: string): boolean {
  // Check isolated overrides first (highest priority - temporary via withEnv)
  const isolatedOverrides = getIsolatedOverrides()
  if (isolatedOverrides?.has(key)) {
    return true
  }

  // Check shared overrides (persistent via setEnv in beforeEach)
  if (sharedOverrides?.has(key)) {
    return true
  }

  // Fall back to process.env (works with vi.stubEnv)
  const env = safeProcessEnv()
  return env ? hasOwn(env, key) : false
}

/**
 * Clear all environment variable overrides. Useful in afterEach hooks to ensure
 * clean test state.
 *
 * @example
 *   ;```typescript
 *   import { resetEnv } from './rewire'
 *
 *   afterEach(() => {
 *     resetEnv()
 *   })
 *   ```
 */
export function resetEnv(): void {
  sharedOverrides?.clear()
}

/**
 * Read `process.env` without assuming a real Node `process`. Probes the
 * GLOBAL `process` via `typeof` (no `node:process` import — webpack throws
 * UnhandledSchemeError on `node:` specifiers before the `browser`-field stubs
 * apply), so browser bundles load this leaf cleanly and env getters read as
 * unset instead of throwing.
 *
 * @private
 */
export function safeProcessEnv():
  | Record<string, string | undefined>
  | undefined {
  return typeof process !== 'undefined' && process ? process.env : undefined
}

/**
 * Set an environment variable override for testing. This does not modify
 * process.env, only affects env getters.
 *
 * Works in test hooks (beforeEach) without needing AsyncLocalStorage context.
 * Vitest's module isolation ensures each test file has independent overrides.
 *
 * @example
 *   ;```typescript
 *   import { setEnv, resetEnv } from './rewire'
 *   import { getCI } from './ci'
 *
 *   beforeEach(() => {
 *     setEnv('CI', '1')
 *   })
 *
 *   afterEach(() => {
 *     resetEnv()
 *   })
 *
 *   it('should detect CI environment', () => {
 *     expect(getCI()).toBe(true)
 *   })
 *   ```
 */
export function setEnv(key: string, value: string | undefined): void {
  sharedOverrides?.set(key, value)
}

/**
 * Run code with environment overrides in an isolated AsyncLocalStorage context.
 * Creates true context isolation - overrides don't leak to concurrent code.
 *
 * Useful for tests that need temporary overrides without affecting other tests
 * or for nested override scenarios.
 *
 * @example
 *   ;```typescript
 *   import { withEnv } from './rewire'
 *   import { getCI } from './ci'
 *
 *   // Temporary override in isolated context
 *   await withEnv({ CI: '1' }, async () => {
 *     expect(getCI()).toBe(true)
 *   })
 *   expect(getCI()).toBe(false) // Override is gone
 *   ```
 *
 * @example
 *   ;```typescript
 *   // Nested overrides work correctly
 *   setEnv('CI', '1') // Shared override (persistent)
 *
 *   await withEnv({ CI: '0' }, async () => {
 *     expect(getCI()).toBe(false) // Isolated override takes precedence
 *   })
 *
 *   expect(getCI()).toBe(true) // Back to shared override
 *   ```
 */
export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const map = new MapCtor(ObjectEntries(overrides))
  return await getIsolatedOverridesStorage().run(map, fn)
}

/**
 * Synchronous version of withEnv for non-async code.
 *
 * @example
 *   ;```typescript
 *   import { withEnvSync } from './rewire'
 *   import { getCI } from './ci'
 *
 *   const result = withEnvSync({ CI: '1' }, () => {
 *     return getCI()
 *   })
 *   expect(result).toBe(true)
 *   ```
 */
export function withEnvSync<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T,
): T {
  const map = new MapCtor(ObjectEntries(overrides))
  return getIsolatedOverridesStorage().run(map, fn)
}
