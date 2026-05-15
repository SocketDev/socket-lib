/**
 * @fileoverview Unit tests for cargo lockfile-format + manifest-format
 * descriptors and their wiring in detectFormat.
 */

import { describe, expect, it } from 'vitest'

import {
  CARGO_LOCK_FILENAME,
  CARGO_LOCK_FORMAT,
} from '@socketsecurity/lib-stable/eco/cargo/lockfile-format'
import {
  CARGO_TOML_FILENAME,
  CARGO_TOML_FORMAT,
} from '@socketsecurity/lib-stable/eco/cargo/manifest-format'
import { detectFormat } from '@socketsecurity/lib-stable/eco/manifest/detect-format'

describe('eco/cargo/lockfile-format', () => {
  it('exports the Cargo.lock filename + descriptor', () => {
    expect(CARGO_LOCK_FILENAME).toBe('Cargo.lock')
    expect(CARGO_LOCK_FORMAT.ecosystem).toBe('cargo')
    expect(CARGO_LOCK_FORMAT.type).toBe('lockfile')
  })
})

describe('eco/cargo/manifest-format', () => {
  it('exports the Cargo.toml filename + descriptor', () => {
    expect(CARGO_TOML_FILENAME).toBe('Cargo.toml')
    expect(CARGO_TOML_FORMAT.ecosystem).toBe('cargo')
    expect(CARGO_TOML_FORMAT.type).toBe('manifest')
  })
})

describe('detectFormat (cargo)', () => {
  it('matches Cargo.lock', () => {
    expect(detectFormat('Cargo.lock')).toMatchObject({
      ecosystem: 'cargo',
      type: 'lockfile',
    })
  })

  it('matches Cargo.toml', () => {
    expect(detectFormat('Cargo.toml')).toMatchObject({
      ecosystem: 'cargo',
      type: 'manifest',
    })
  })

  it('matches Cargo.lock in a nested path', () => {
    expect(detectFormat('/abs/path/Cargo.lock')).toMatchObject({
      ecosystem: 'cargo',
      type: 'lockfile',
    })
  })
})
