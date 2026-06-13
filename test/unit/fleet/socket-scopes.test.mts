// vitest specs for scripts/fleet/constants/socket-scopes.mts — the canonical
// Socket-owned package/repo patterns shared by the soak surfaces, plus the
// security invariant that forbids an unscoped prefix glob.

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
  isSocketSourcedPackage,
  isSocketSourcedRepository,
  SOCKET_PACKAGE_PATTERNS,
} from '../../../scripts/fleet/constants/socket-scopes.mts'

describe('socket-scopes / SOCKET_PACKAGE_PATTERNS security invariant', () => {
  test('contains NO unscoped wildcard (a socket-* glob is a soak-bypass hole)', () => {
    for (const pattern of SOCKET_PACKAGE_PATTERNS) {
      if (pattern.includes('*')) {
        assert.ok(
          pattern.startsWith('@'),
          `unscoped wildcard "${pattern}" would soak-bypass any attacker-published match`,
        )
      }
    }
  })
})

describe('socket-scopes / isSocketSourcedPackage', () => {
  test('scoped glob matches any member of an owned scope', () => {
    assert.ok(isSocketSourcedPackage('@socketsecurity/lib'))
    assert.ok(isSocketSourcedPackage('pkg:npm/@socketsecurity/lib@6.0.6'))
    assert.ok(isSocketSourcedPackage('@stuie/core'))
    assert.ok(isSocketSourcedPackage('@ultrathink/acorn'))
  })

  test('unscoped Socket packages match by EXACT name', () => {
    assert.ok(isSocketSourcedPackage('socket'))
    assert.ok(isSocketSourcedPackage('sfw'))
  })

  test('an attacker-published socket-prefixed name is NOT sourced', () => {
    // The whole point of dropping the `socket-*` prefix glob.
    assert.ok(!isSocketSourcedPackage('socket-evil'))
    assert.ok(!isSocketSourcedPackage('socket-malware'))
    // Deprecated/renamed packages are not in the list either.
    assert.ok(!isSocketSourcedPackage('socket-cli'))
  })

  test('a plain third-party package is not sourced', () => {
    assert.ok(!isSocketSourcedPackage('left-pad'))
    assert.ok(!isSocketSourcedPackage('@yuku-parser/binding-darwin-arm64'))
  })
})

describe('socket-scopes / isSocketSourcedRepository', () => {
  test('SocketDev-owned repo (prefixed or bare, case-insensitive)', () => {
    assert.ok(isSocketSourcedRepository('github:SocketDev/sfw-free'))
    assert.ok(isSocketSourcedRepository('SocketDev/firewall-release'))
    assert.ok(isSocketSourcedRepository('github:socketdev/x'))
  })

  test('a non-Socket repo is not sourced', () => {
    assert.ok(!isSocketSourcedRepository('github:evil/repo'))
    assert.ok(!isSocketSourcedRepository('rust-lang/regex'))
  })
})
