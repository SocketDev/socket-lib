/**
 * @file Unit tests for `installNativeHost` — focused on the input-validation
 *   guards (production-mode wildcard rejection, empty allowedOrigins) plus
 *   `buildManifest` shape. The filesystem-write paths (chromeManifestDirs,
 *   wrapper writes, Windows registry add) are covered by integration tests that
 *   actually exercise the OS — keeping this file fast + hermetic.
 */

import { describe, expect, it } from 'vitest'

import {
  HOST_NAME,
  MIN_NODE_VERSION_FOR_STRIP_TYPES,
  buildManifest,
  installNativeHost,
} from '../../../src/native-messaging/install'

describe('buildManifest', () => {
  it('returns the canonical Chrome native-host manifest shape', () => {
    const manifest = buildManifest('/abs/path/wrapper.sh', [
      'chrome-extension://abc/',
    ]) as Record<string, unknown>
    // The literal canonical value (asserted against HOST_NAME itself below) —
    // a -stable HOST_NAME isn't published, and the src constant can't build its
    // own expected value (no-src-import-in-test-expect).
    expect(manifest['name']).toBe('dev.socket.trusted_publisher_host')
    expect(manifest['type']).toBe('stdio')
    expect(manifest['path']).toBe('/abs/path/wrapper.sh')
    expect(manifest['allowed_origins']).toEqual(['chrome-extension://abc/'])
  })

  it('passes allowedOrigins through verbatim (including multiple)', () => {
    const manifest = buildManifest('/x', [
      'chrome-extension://a/',
      'chrome-extension://b/',
    ]) as Record<string, unknown>
    expect(manifest['allowed_origins']).toEqual([
      'chrome-extension://a/',
      'chrome-extension://b/',
    ])
  })

  it('passes `*` through (caller decides if dev mode permits it)', () => {
    // buildManifest is layer-1 — it doesn't enforce policy, it just
    // builds the JSON. installNativeHost is where the production-mode
    // wildcard rejection lives.
    const manifest = buildManifest('/x', ['*']) as Record<string, unknown>
    expect(manifest['allowed_origins']).toEqual(['*'])
  })
})

describe('installNativeHost — input validation', () => {
  it('rejects production: true with a `*` origin', () => {
    expect(() =>
      installNativeHost({
        allowedOrigins: ['*'],
        production: true,
      }),
    ).toThrow(/production mode rejects allowedOrigins '\*'/)
  })

  it('rejects production: true with `*` mixed into a list of real IDs', () => {
    // Even one `*` in the list is enough — Chrome ORs origins, so a
    // wildcard alongside a specific ID effectively allows everyone.
    expect(() =>
      installNativeHost({
        allowedOrigins: ['chrome-extension://abc/', '*'],
        production: true,
      }),
    ).toThrow(/production mode rejects/)
  })

  it('rejects an empty allowedOrigins list (dev mode)', () => {
    expect(() =>
      installNativeHost({
        allowedOrigins: [],
      }),
    ).toThrow(/must contain at least one origin/)
  })

  it('rejects an empty allowedOrigins list (production mode)', () => {
    expect(() =>
      installNativeHost({
        allowedOrigins: [],
        production: true,
      }),
    ).toThrow(/must contain at least one origin/)
  })

  // The "happy path" (production: true with a real extension ID) writes
  // to ~/Library/Application Support/... and adds Chrome NM directories;
  // exercising it in a unit test would touch the dev machine's real
  // Chrome config. That's an integration test, not a unit test — leave
  // it for the `test/integration/native-messaging/` suite (TBD).
})

describe('constants', () => {
  it('exports the canonical host name', () => {
    expect(HOST_NAME).toBe('dev.socket.trusted_publisher_host')
  })

  it('exports the minimum Node version', () => {
    // Matches the Node 22.6 floor for stable type-stripping.
    expect(MIN_NODE_VERSION_FOR_STRIP_TYPES).toBe('22.6.0')
  })
})
