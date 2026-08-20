/**
 * @file Regression tests for the externals-build define map. Substituting a
 *   bare identifier that is a REAL runtime global rewrites a dependency's
 *   correct feature detection (`typeof navigator !== 'undefined' &&
 *   navigator.platform`) into a `(void 0).platform` crash: the `typeof`
 *   guard survives the define, the property access does not. Node keeps
 *   promoting browser globals (navigator in 21, WebSocket in 22), so the
 *   assertion is against the RUNNING runtime's globals rather than a frozen
 *   list — a future Node promotion fails here before it ships a broken
 *   bundle. The behavioral half proves the 6.5.0 casualty stays fixed: the
 *   bundled picomatch's isWindows runs the navigator branch at match time.
 */

import { describe, expect, it } from 'vitest'

import { getGlobMatcher } from '@socketsecurity/lib/globs/matcher'

import { GUARDED_DEFINES } from '../../scripts/repo/build-externals/guarded-defines.mts'

describe('externals guarded defines', () => {
  it('never substitutes a bare identifier that is a real global in this runtime', () => {
    const bareIdentifiers = Object.keys(GUARDED_DEFINES).filter(
      key => !key.includes('.'),
    )
    const shadowedGlobals = bareIdentifiers.filter(key => key in globalThis)
    expect(shadowedGlobals).toEqual([])
  })

  it('getGlobMatcher works with dot matching (bundled picomatch isWindows path)', () => {
    const matcher = getGlobMatcher('**/package.json', { dot: true })
    expect(matcher('packages/cli/package.json')).toBe(true)
    expect(matcher('.config/nested/package.json')).toBe(true)
    expect(matcher('src/index.ts')).toBe(false)
  })
})
