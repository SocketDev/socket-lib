/**
 * @file Unit tests for `github/reviews.mts`. Both functions eventually call
 *   into `httpRequest`, which runs over real node:http — so, matching
 *   `test/unit/github/request.test.mts` and `test/unit/github-commit.test.mts`,
 *   HTTP is intercepted with `nock` under `disableNetConnect()` rather than
 *   mocked at the module boundary. No network is touched.
 */

import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GitHubEmptyBodyError } from '../../../src/github/errors.mjs'
import {
  getPullRequestReviewNodeId,
  updatePullRequestReviewBody,
} from '../../../src/github/reviews.mjs'

const GITHUB_API = 'https://api.github.com'

describe('github/reviews', () => {
  beforeEach(() => {
    nock.disableNetConnect()
    nock.cleanAll()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  describe('getPullRequestReviewNodeId', () => {
    it('resolves the node_id from the REST review payload', async () => {
      nock(GITHUB_API)
        .get('/repos/owner/repo/pulls/42/reviews/99')
        .reply(200, { id: 99, node_id: 'PRR_kwDOexample', state: 'APPROVED' })

      const nodeId = await getPullRequestReviewNodeId('owner', 'repo', 42, 99)
      expect(nodeId).toBe('PRR_kwDOexample')
    })

    it('passes the token through to the REST call', async () => {
      nock(GITHUB_API, { reqheaders: { authorization: 'Bearer tok-123' } })
        .get('/repos/owner/repo/pulls/1/reviews/2')
        .reply(200, { id: 2, node_id: 'PRR_authed' })

      const nodeId = await getPullRequestReviewNodeId('owner', 'repo', 1, 2, {
        token: 'tok-123',
      })
      expect(nodeId).toBe('PRR_authed')
    })
  })

  describe('updatePullRequestReviewBody', () => {
    it('sends the mutation and returns the updated review id', async () => {
      let capturedBody: unknown
      nock(GITHUB_API, { reqheaders: { authorization: 'Bearer tok-abc' } })
        .post('/graphql', body => {
          capturedBody = body
          return true
        })
        .reply(200, {
          data: {
            updatePullRequestReview: {
              pullRequestReview: { id: 'PRR_kwDOexample' },
            },
          },
        })

      const result = await updatePullRequestReviewBody(
        'PRR_kwDOexample',
        'shorter body',
        { token: 'tok-abc' },
      )

      expect(result).toEqual({ id: 'PRR_kwDOexample' })
      const parsed = capturedBody as {
        query: string
        variables: { body: string; id: string }
      }
      expect(parsed.query).toMatch(/updatePullRequestReview/)
      expect(parsed.variables).toEqual({
        body: 'shorter body',
        id: 'PRR_kwDOexample',
      })
    })

    it('throws on non-OK status', async () => {
      nock(GITHUB_API).post('/graphql').reply(502, '')
      await expect(
        updatePullRequestReviewBody('PRR_x', 'body'),
      ).rejects.toThrow(/GitHub GraphQL API error 502/)
    })

    it('throws GitHubEmptyBodyError when 200 OK + empty body', async () => {
      nock(GITHUB_API).post('/graphql').reply(200, '')
      await expect(
        updatePullRequestReviewBody('PRR_empty', 'body'),
      ).rejects.toThrow(GitHubEmptyBodyError)
    })

    it('throws on malformed JSON body', async () => {
      nock(GITHUB_API).post('/graphql').reply(200, '<html>not json</html>')
      await expect(
        updatePullRequestReviewBody('PRR_bad', 'body'),
      ).rejects.toThrow(
        /Failed to parse GitHub GraphQL response for review PRR_bad/,
      )
    })

    it('throws when GraphQL returns errors[]', async () => {
      nock(GITHUB_API)
        .post('/graphql')
        .reply(200, { errors: [{ message: 'Could not resolve to a node' }] })
      await expect(
        updatePullRequestReviewBody('PRR_unknown', 'body'),
      ).rejects.toThrow(/Could not resolve to a node/)
    })

    it('throws when the mutation returns no review', async () => {
      nock(GITHUB_API)
        .post('/graphql')
        .reply(200, {
          data: {
            updatePullRequestReview: {
              // oxlint-disable-next-line socket/prefer-undefined-over-null -- GraphQL spec returns null for unresolved nodes
              pullRequestReview: null,
            },
          },
        })
      await expect(
        updatePullRequestReviewBody('PRR_none', 'body'),
      ).rejects.toThrow(/returned no review/)
    })
  })
})
