/**
 * @fileoverview Platform / capability-gated test wrappers.
 *
 * Wrap `it` / `describe` so that:
 *  1. The condition is encoded in the helper name (no inline `skipIf`
 *     boolean to misread).
 *  2. The skip reason is prefixed onto the test title (`[windows] ...`),
 *     so any reporter — and any post-run aggregator — can group by tag
 *     without parsing source code.
 *
 * Use these instead of raw `it.skipIf(...)` / `describe.skipIf(...)` for
 * platform / network / engine-feature gates.
 *
 * @example
 * ```ts
 * import { itWindowsOnly, itUnixOnly, itNetworkOnly } from '../utils/skip-helpers'
 *
 * itWindowsOnly('should convert MSYS drive letter paths', () => { ... })
 * itUnixOnly('should not convert MSYS-like paths on Unix', () => { ... })
 * itNetworkOnly('should resolve a real npm package', async () => { ... })
 * ```
 */

import process from 'node:process'

import { WIN32 } from '@socketsecurity/lib/constants/platform'
import { describe, it } from 'vitest'

const skipNetwork = !!process.env['SOCKET_LIB_SKIP_NETWORK_TESTS']

const TAG_WINDOWS = '[windows]'
const TAG_UNIX = '[unix]'
const TAG_NETWORK = '[network]'

type ItArgs = Parameters<typeof it>
type ItFn = ItArgs[1]
type ItOpts = ItArgs[2]

type DescribeArgs = Parameters<typeof describe>
type DescribeFn = DescribeArgs[1]

function tagged(name: string, tag: string): string {
  return `${tag} ${name}`
}

/**
 * Test that only runs on Windows. Skipped on Unix-likes.
 */
export function itWindowsOnly(name: string, fn?: ItFn, opts?: ItOpts): void {
  it.skipIf(!WIN32)(tagged(name, TAG_WINDOWS), fn as ItFn, opts)
}

/**
 * Test that only runs on Unix-likes (Linux, macOS). Skipped on Windows.
 */
export function itUnixOnly(name: string, fn?: ItFn, opts?: ItOpts): void {
  it.skipIf(WIN32)(tagged(name, TAG_UNIX), fn as ItFn, opts)
}

/**
 * Test that hits the live network. Skipped when
 * `SOCKET_LIB_SKIP_NETWORK_TESTS` env var is set.
 */
export function itNetworkOnly(name: string, fn?: ItFn, opts?: ItOpts): void {
  it.skipIf(skipNetwork)(tagged(name, TAG_NETWORK), fn as ItFn, opts)
}

/**
 * Describe block that only runs on Windows. Skipped on Unix-likes.
 */
export function describeWindowsOnly(name: string, fn: DescribeFn): void {
  describe.skipIf(!WIN32)(tagged(name, TAG_WINDOWS), fn)
}

/**
 * Describe block that only runs on Unix-likes. Skipped on Windows.
 */
export function describeUnixOnly(name: string, fn: DescribeFn): void {
  describe.skipIf(WIN32)(tagged(name, TAG_UNIX), fn)
}

/**
 * Describe block that hits the live network. Skipped when
 * `SOCKET_LIB_SKIP_NETWORK_TESTS` env var is set.
 */
export function describeNetworkOnly(name: string, fn: DescribeFn): void {
  describe.skipIf(skipNetwork)(tagged(name, TAG_NETWORK), fn)
}
