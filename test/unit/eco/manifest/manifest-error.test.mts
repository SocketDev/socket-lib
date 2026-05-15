/**
 * @fileoverview Unit tests for src/eco/manifest/manifest-error.ts.
 */

import { describe, expect, it } from 'vitest'

import { ManifestError } from '@socketsecurity/lib-stable/eco/manifest/manifest-error'

describe('eco/manifest/manifest-error', () => {
  it('has name "ManifestError"', () => {
    const err = new ManifestError('boom', 'ERR_INVALID_JSON')
    expect(err.name).toBe('ManifestError')
  })

  it('preserves message and code', () => {
    const err = new ManifestError('bad input', 'ERR_UNKNOWN_FORMAT')
    expect(err.message).toBe('bad input')
    expect(err.code).toBe('ERR_UNKNOWN_FORMAT')
  })

  it('is an instance of Error', () => {
    const err = new ManifestError('boom', 'ERR_UNSUPPORTED')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ManifestError)
  })
})
