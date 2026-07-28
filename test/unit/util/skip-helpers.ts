/**
 * @file Platform / capability-gated test wrappers. Wrap `it` / `describe` so
 *   that:
 *
 *   1. The condition is encoded in the helper name (no inline `skipIf` boolean to
 *      misread).
 *   2. The skip reason is prefixed onto the test title (`[windows] ...`), so any
 *      reporter — and any post-run aggregator — can group by tag without
 *      parsing source code. Use these instead of raw `it.skipIf(...)` /
 *      `describe.skipIf(...)` for platform / network / engine-feature gates.
 *
 * @example
 *   ;```ts
 *   import { itWindowsOnly, itUnixOnly, itNetworkOnly } from '../util/skip-helpers'
 *
 *   itWindowsOnly('should convert MSYS drive letter paths', () => { ... })
 *   itUnixOnly('should not convert MSYS-like paths on Unix', () => { ... })
 *   itNetworkOnly('should resolve a real npm package', async () => { ... })
 *   ```
 */

import process from 'node:process'

import { WIN32 } from '../../../src/constants/platform'
import { describe, it } from 'vitest'

// Read the flag at call time (inside the wrappers below), not at module import.
// The wrappers run during test collection, after vitest's setupFiles have set
// SOCKET_LIB_SKIP_NETWORK_TESTS; a module-scope const would capture the value
// before setup ran, so a worker that imported this file first would see the
// flag unset and run the live-network suites (leaking a sibling file's Nock
// disableNetConnect into them).
function shouldSkipNetwork(): boolean {
  return !!process.env['SOCKET_LIB_SKIP_NETWORK_TESTS']
}

const TAG_WINDOWS = '[windows]'
const TAG_UNIX = '[unix]'
const TAG_NETWORK = '[network]'

type TestFn = () => void | Promise<void>
type SuiteFn = () => void

/**
 * Describe block that hits the live network. Skipped when
 * `SOCKET_LIB_SKIP_NETWORK_TESTS` env var is set.
 */
export function describeNetworkOnly(name: string, fn: SuiteFn): void {
  describe.skipIf(shouldSkipNetwork())(tagged(name, TAG_NETWORK), fn)
}

/**
 * Describe block gated on a runtime capability (engine version, native builtin,
 * environment variable, etc.). Pass `available: true` to run, `false` to skip.
 * The `capability` is shown in the test title as `[needs:<capability>]` so
 * reporters can surface the reason.
 *
 * @example
 *   ;```ts
 *   describeRequires(
 *   'Error.isError',
 *   typeof Error.isError === 'function',
 *   'isErrorBuiltin',
 *   () => {
 *   it('uses the native builtin', () => { ... })
 *   }
 *   )
 *   ```
 */
// socket-lint: allow boolean-trap -- callers pass a positional boolean; changing to options object would break existing call sites in other files
export function describeRequires(
  capability: string,
  available: boolean,
  name: string,
  fn: SuiteFn,
): void {
  describe.skipIf(!available)(`[needs:${capability}] ${name}`, fn)
}

/**
 * Describe block that only runs on Unix-likes. Skipped on Windows.
 */
export function describeUnixOnly(name: string, fn: SuiteFn): void {
  describe.skipIf(WIN32)(tagged(name, TAG_UNIX), fn)
}

/**
 * Describe block that only runs on Windows. Skipped on Unix-likes.
 */
export function describeWindowsOnly(name: string, fn: SuiteFn): void {
  describe.skipIf(!WIN32)(tagged(name, TAG_WINDOWS), fn)
}

/**
 * Test that hits the live network. Skipped when `SOCKET_LIB_SKIP_NETWORK_TESTS`
 * env var is set.
 */
export function itNetworkOnly(name: string, fn: TestFn): void {
  it.skipIf(shouldSkipNetwork())(tagged(name, TAG_NETWORK), fn)
}

/**
 * Test gated on a runtime capability. Same shape as `describeRequires`.
 */
// socket-lint: allow boolean-trap -- callers pass a positional boolean; changing to options object would break existing call sites in other files
export function itRequires(
  capability: string,
  available: boolean,
  name: string,
  fn: TestFn,
): void {
  it.skipIf(!available)(`[needs:${capability}] ${name}`, fn)
}

/**
 * Test that only runs on Unix-likes (Linux, macOS). Skipped on Windows. An
 * optional `timeout` (ms) is forwarded to vitest for long-running cases.
 */
export function itUnixOnly(
  name: string,
  fn: TestFn,
  timeout?: number | undefined,
): void {
  it.skipIf(WIN32)(tagged(name, TAG_UNIX), fn, timeout)
}

/**
 * Test that only runs on Windows. Skipped on Unix-likes.
 */
export function itWindowsOnly(name: string, fn: TestFn): void {
  it.skipIf(!WIN32)(tagged(name, TAG_WINDOWS), fn)
}

export function tagged(name: string, tag: string): string {
  return `${tag} ${name}`
}
