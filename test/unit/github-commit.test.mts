/**
 * @file Unit tests for `createSignedCommit` — the blob -> tree -> commit ->
 *   ref PATCH helper that lands a web-flow-verified commit from CI. HTTP is
 *   mocked with nock (node:http intercept) under `disableNetConnect()`.
 */

import nock from 'nock'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { createSignedCommit } from '../../src/github/commit'

const API = 'https://api.github.com'

beforeAll(() => {
  nock.disableNetConnect()
})

afterAll(() => {
  nock.enableNetConnect()
})

afterEach(() => {
  nock.cleanAll()
})

describe('createSignedCommit', () => {
  it('chains blob -> tree -> commit -> ref and returns the new commit SHA', async () => {
    const scope = nock(API)
      .post('/repos/o/r/git/blobs')
      .reply(201, { sha: 'blobA' })
      .post('/repos/o/r/git/blobs')
      .reply(201, { sha: 'blobB' })
      .post('/repos/o/r/git/trees')
      .reply(201, { sha: 'treeX' })
      .post('/repos/o/r/git/commits')
      .reply(201, { sha: 'commitZ' })
      .patch('/repos/o/r/git/refs/heads/main')
      .reply(200, {})

    const sha = await createSignedCommit({
      baseTreeSha: 'basetree1',
      branch: 'main',
      files: [
        { content: '{"version":"1.1.0"}', path: 'package.json' },
        { content: '# Changelog', path: 'CHANGELOG.md' },
      ],
      message: 'chore: bump version to 1.1.0',
      parentSha: 'parent1',
      repo: 'o/r',
      token: 'tok',
    })

    expect(sha).toBe('commitZ')
    scope.done()
  })

  it('sends base64 blob content, a base_tree, parent, and message', async () => {
    const scope = nock(API)
      .post('/repos/o/r/git/blobs', body => {
        expect(body.encoding).toBe('base64')
        expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe(
          '{"v":1}',
        )
        return true
      })
      .reply(201, { sha: 'b1' })
      .post('/repos/o/r/git/trees', body => {
        expect(body.base_tree).toBe('basetree1')
        expect(body.tree[0].path).toBe('package.json')
        expect(body.tree[0].mode).toBe('100644')
        expect(body.tree[0].sha).toBe('b1')
        return true
      })
      .reply(201, { sha: 't1' })
      .post('/repos/o/r/git/commits', body => {
        expect(body.message).toBe('chore: bump version to 1.1.0')
        expect(body.parents).toEqual(['parent1'])
        expect(body.tree).toBe('t1')
        return true
      })
      .reply(201, { sha: 'c1' })
      .patch('/repos/o/r/git/refs/heads/main', body => {
        expect(body.sha).toBe('c1')
        return true
      })
      .reply(200, {})

    const sha = await createSignedCommit({
      baseTreeSha: 'basetree1',
      branch: 'main',
      files: [{ content: '{"v":1}', path: 'package.json' }],
      message: 'chore: bump version to 1.1.0',
      parentSha: 'parent1',
      repo: 'o/r',
      token: 'tok',
    })

    expect(sha).toBe('c1')
    scope.done()
  })

  it('uses the apiUrl override when provided', async () => {
    const custom = 'https://github.example.com/api/v3'
    const scope = nock(custom)
      .post('/repos/owner/name/git/blobs')
      .reply(201, { sha: 'blob1' })
      .post('/repos/owner/name/git/trees')
      .reply(201, { sha: 'tree1' })
      .post('/repos/owner/name/git/commits')
      .reply(201, { sha: 'commit1' })
      .patch('/repos/owner/name/git/refs/heads/main')
      .reply(200, {})

    const sha = await createSignedCommit({
      apiUrl: custom,
      baseTreeSha: 'base1',
      branch: 'main',
      files: [{ content: 'hello', path: 'hello.txt' }],
      message: 'test commit',
      parentSha: 'parent1',
      repo: 'owner/name',
      token: 'tok',
    })

    expect(sha).toBe('commit1')
    scope.done()
  })

  it('throws when a blob POST fails', async () => {
    nock(API).post('/repos/o/r/git/blobs').reply(500, 'Internal Server Error')

    await expect(
      createSignedCommit({
        baseTreeSha: 'base1',
        branch: 'main',
        files: [{ content: 'x', path: 'x.txt' }],
        message: 'test',
        parentSha: 'parent1',
        repo: 'o/r',
        token: 'tok',
      }),
    ).rejects.toThrow(/GitHub API POST.*failed/)
  })

  it('throws when the ref PATCH fails', async () => {
    nock(API)
      .post('/repos/o/r/git/blobs')
      .reply(201, { sha: 'b1' })
      .post('/repos/o/r/git/trees')
      .reply(201, { sha: 't1' })
      .post('/repos/o/r/git/commits')
      .reply(201, { sha: 'c1' })
      .patch('/repos/o/r/git/refs/heads/main')
      .reply(422, 'Unprocessable Entity')

    await expect(
      createSignedCommit({
        baseTreeSha: 'base1',
        branch: 'main',
        files: [{ content: 'x', path: 'x.txt' }],
        message: 'test',
        parentSha: 'parent1',
        repo: 'o/r',
        token: 'tok',
      }),
    ).rejects.toThrow(/GitHub API PATCH.*failed/)
  })
})
