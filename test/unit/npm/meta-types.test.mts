/**
 * @file Type-level cross-check between this client's raw packument type
 *   surface (`RawPackumentVersion` / `RawVersionDist`, `./meta-types`) and
 *   `./registry`'s `PackumentVersion` / `PackumentVersionDist`. The two
 *   hierarchies are deliberately separate (see the `@file` doc on
 *   `RawPackument`) — this only asserts the fields they DO intentionally
 *   share stay assignable, so a future edit to either side that silently
 *   breaks the overlap fails `tsgo --noEmit`, not just a runtime test.
 */

import { describe, expect, it } from 'vitest'

import type {
  PackumentVersion,
  PackumentVersionDist,
} from '../../../src/npm/registry'
import type {
  RawPackumentVersion,
  RawVersionDist,
} from '../../../src/npm/meta-types'

/**
 * Type-checked at compile time: fails if `PackumentVersion.deprecated` ever
 * stops being assignable to `RawPackumentVersion.deprecated`.
 */
function assignRegistryVersionToCommonRawShape(
  version: PackumentVersion,
): Pick<RawPackumentVersion, 'deprecated'> {
  return { deprecated: version.deprecated }
}

/**
 * Type-checked at compile time: fails if `PackumentVersionDist.tarball` ever
 * stops being assignable to `RawVersionDist.tarball`.
 */
function assignRegistryDistToCommonRawShape(
  dist: PackumentVersionDist,
): Pick<RawVersionDist, 'tarball'> {
  return { tarball: dist.tarball }
}

describe('RawPackument type surface — registry.ts cross-reference', () => {
  it('keeps the fields RawPackumentVersion intentionally shares with registry.ts assignable', () => {
    expect(
      assignRegistryVersionToCommonRawShape({ deprecated: 'use v2' }),
    ).toEqual({ deprecated: 'use v2' })
  })

  it('keeps the fields RawVersionDist intentionally shares with registry.ts assignable', () => {
    expect(
      assignRegistryDistToCommonRawShape({ tarball: 'https://x/pkg.tgz' }),
    ).toEqual({ tarball: 'https://x/pkg.tgz' })
  })
})
