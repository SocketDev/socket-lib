// vitest spec for src/github/packages.ts. Pure string builders, so there is no
// I/O to mock and no network to reach. Every org and package name below is
// fictional.

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  CONTAINER_VERSIONS_PER_PAGE,
  containerPackagePath,
  containerSettingsUrl,
  containerVersionsPath,
} from '../../../src/github/packages.ts'

describe('containerPackagePath', () => {
  test('leaves a name with no slash alone', () => {
    assert.equal(containerPackagePath('node-base'), 'node-base')
  })

  test('escapes a single slash', () => {
    assert.equal(
      containerPackagePath('example-repo/example-pack'),
      'example-repo%2Fexample-pack',
    )
  })

  // The regression this module exists for: `name.replace('/', '%2F')` escapes
  // only the first slash, leaving a raw one that splits into an extra REST path
  // segment and 404s.
  test('escapes EVERY slash in a deeply nested name', () => {
    const encoded = containerPackagePath('example-repo/example-pack/inner')
    assert.equal(encoded, 'example-repo%2Fexample-pack%2Finner')
    assert.ok(!encoded.includes('/'))
  })

  test('escapes characters beyond the slash', () => {
    assert.equal(containerPackagePath('example pack+1'), 'example%20pack%2B1')
  })
})

describe('containerVersionsPath', () => {
  test('defaults per_page to the module constant', () => {
    assert.equal(
      containerVersionsPath('example-org', 'example-repo/example-pack'),
      `/orgs/example-org/packages/container/example-repo%2Fexample-pack/versions?per_page=${CONTAINER_VERSIONS_PER_PAGE}`,
    )
  })

  test('honors an explicit per_page', () => {
    assert.equal(
      containerVersionsPath('example-org', 'node-base', 25),
      '/orgs/example-org/packages/container/node-base/versions?per_page=25',
    )
  })

  test('encodes the owner too', () => {
    assert.ok(
      containerVersionsPath('example org', 'node-base').startsWith(
        '/orgs/example%20org/',
      ),
    )
  })
})

describe('containerSettingsUrl', () => {
  test('points at github.com, not the API host', () => {
    const url = containerSettingsUrl('example-org', 'example-repo/example-pack')
    assert.equal(
      url,
      'https://github.com/orgs/example-org/packages/container/example-repo%2Fexample-pack/settings',
    )
    assert.ok(!url.includes('api.github.com'))
  })
})
