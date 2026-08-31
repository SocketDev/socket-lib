/**
 * @file Unit tests for `extractHttpStatus`, the one reader that pulls an HTTP
 *   status back off an error. It has to recognise both error shapes the
 *   metadata path throws - the generic HTTP response error and the packument
 *   miss - and answer undefined for anything else, so a caller never mistakes
 *   an unrelated failure for a status it can branch on.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { PackumentNotFoundError } from '../../../../../src/eco/npm/meta-cache/node.mjs'
import { extractHttpStatus } from '../../../../../src/eco/npm/meta/node.mjs'
import { makeHttpResponseError } from '../meta-test-helpers.mjs'

describe('extractHttpStatus', () => {
  test('reads the status off an HttpResponseError', () => {
    const error = makeHttpResponseError(503, 'Service Unavailable')
    assert.equal(extractHttpStatus(error), 503)
  })

  test('reads the status off a PackumentNotFoundError', () => {
    assert.equal(
      extractHttpStatus(new PackumentNotFoundError('example-pkg', 404)),
      404,
    )
  })

  test('an unrelated error carries no status', () => {
    assert.equal(extractHttpStatus(new Error('socket hang up')), undefined)
  })
})
