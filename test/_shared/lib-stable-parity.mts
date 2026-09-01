/**
 * @file Compare current behavior against the last published release.
 *   A parity test imports the same export twice, once from `../../src/...` and
 *   once from `@socketsecurity/lib-stable`, and asserts they agree. That only
 *   works while the released build carries a real implementation of the leaf.
 *   The published build compiles out every leaf no fleet repo imports, so a
 *   leaf being exposed for the FIRST time has a stub on the stable side: the
 *   parity call throws instead of returning. Without this helper the suite goes
 *   red for exactly one release cycle, and it goes red on the change that
 *   correctly exposed the leaf - the release that would fix it cannot ship past
 *   its own red gate.
 *   Wrapping the stable side in {@link stableValue} makes that state readable
 *   instead of fatal: the test asserts parity when the release can answer, and
 *   asserts the current implementation alone when it cannot.
 */

import { STUB_ERROR_CODE } from '../../scripts/repo/build-stubs/unexposed.mts'

/**
 * Whether the released build can answer for this leaf.
 *
 * Pair it with `it.skipIf(!stableAvailable(…))` rather than degrading the
 * assertion to a weaker one. A parity check that quietly compares `undefined`
 * to `undefined` reports a pass it did not earn, and the runner's skip line is
 * what tells a reader the comparison did not happen.
 */
export function stableAvailable(probe: () => unknown): boolean {
  try {
    probe()
    return true
  } catch (e) {
    if (isCompiledOutError(e)) {
      return false
    }
    throw e
  }
}

/**
 * Whether a thrown value is a build-stub's compiled-out error.
 *
 * Keyed on the `code` the stub sets. The message test is the FALLBACK tier and
 * exists only for releases published before the code was added, whose stubs
 * throw a bare `Error`; it can be dropped once no supported release predates
 * the code.
 */
export function isCompiledOutError(e: unknown): boolean {
  if (!(e instanceof Error)) {
    return false
  }
  if ((e as NodeJS.ErrnoException).code === STUB_ERROR_CODE) {
    return true
  }
  return e.message.includes('is compiled out of this @socketsecurity/lib build')
}
