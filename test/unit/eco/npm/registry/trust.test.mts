/**
 * @file Unit tests for the npm trusted-publisher endpoints. The HTTP adapter is
 *   the in-memory double from `./api-helpers`, so every case runs with no
 *   network.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { fetchTrustedPublishers } from '../../../../src/npm/registry/trust.mjs'
import { recordingHttp } from './api-helpers.mjs'

const AUTH = { token: 'tok' }

describe('fetchTrustedPublishers', () => {
  test('a non-array body yields no configs but stays reachable', async () => {
    // The route is documented to answer an array. Anything else is a shape we
    // cannot read, which is different from a registry we could not reach.
    const stub = recordingHttp({ unexpected: 'object' })
    const read = await fetchTrustedPublishers('example-pkg', {
      ...stub,
      ...AUTH,
    })
    assert.deepEqual(read.configs, [])
    assert.equal(read.reachable, true)
  })
})
