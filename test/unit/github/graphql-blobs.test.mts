import { describe, expect, it, vi } from 'vitest'

import { readGitHubGraphQLBlobs } from '../../../src/github/graphql-blobs.mjs'

import type {
  GitHubGraphQLBlobRequest,
  GitHubGraphQLBlobResponse,
  GitHubGraphQLQuery,
} from '../../../src/github/graphql-blobs.mjs'

// GraphQL uses null for an unresolved object and a binary blob's text field.
// oxlint-disable-next-line socket/prefer-undefined-over-null -- match the GraphQL response contract.
const GRAPHQL_NULL = null

function request(path = 'action.yml'): GitHubGraphQLBlobRequest {
  return {
    owner: 'fixture-org',
    repository: 'fixture-action',
    commit: 'a'.repeat(40),
    path,
  }
}

function blob(text = 'name: fixture\n') {
  return {
    oid: 'b'.repeat(40),
    byteSize: Buffer.byteLength(text),
    isBinary: false,
    isTruncated: false,
    text,
  }
}

function responseFor(
  blobs: ReadonlyArray<Record<string, unknown> | null | undefined>,
): GitHubGraphQLBlobResponse {
  return {
    data: Object.fromEntries(
      blobs.flatMap((value, index) =>
        value === undefined
          ? []
          : [
              [
                `b${index}`,
                {
                  object:
                    value === GRAPHQL_NULL
                      ? GRAPHQL_NULL
                      : { __typename: 'Blob', ...value },
                },
              ],
            ],
      ),
    ),
  }
}

function successfulQuery(text = 'name: fixture\n') {
  return vi.fn<GitHubGraphQLQuery>(async (_query, variables) => {
    const count = Object.keys(variables).length / 3
    return responseFor(Array.from({ length: count }, () => blob(text)))
  })
}

describe('github/graphql-blobs', () => {
  it('returns no blobs and sends no request for an empty list', async () => {
    const query = successfulQuery()
    await expect(
      readGitHubGraphQLBlobs({ query, requests: [] }),
    ).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('builds one aliased query and returns validated blobs in order', async () => {
    const query = successfulQuery('naïve\n')
    const requests = [request('action.yml'), request('nested/action.yaml')]
    const blobs = await readGitHubGraphQLBlobs({ query, requests })
    expect(blobs).toEqual([blob('naïve\n'), blob('naïve\n')])
    expect(query).toHaveBeenCalledTimes(1)
    const { 0: queryText, 1: variables } = query.mock.calls[0]!
    expect(queryText).toContain('b0: repository')
    expect(queryText).toContain('b1: repository')
    expect(queryText).toContain(
      '... on Blob { oid byteSize isBinary isTruncated text }',
    )
    expect(variables).toEqual({
      owner0: 'fixture-org',
      repository0: 'fixture-action',
      expression0: `${'a'.repeat(40)}:action.yml`,
      owner1: 'fixture-org',
      repository1: 'fixture-action',
      expression1: `${'a'.repeat(40)}:nested/action.yaml`,
    })
  })

  it('splits batches at the maximum alias count', async () => {
    const query = successfulQuery()
    const blobs = await readGitHubGraphQLBlobs({
      query,
      requests: Array.from({ length: 5 }, (_, index) =>
        request(`action-${index}.yml`),
      ),
    })
    expect(query).toHaveBeenCalledTimes(2)
    expect(blobs).toHaveLength(5)
    expect(Object.keys(query.mock.calls[0]![1])).toHaveLength(12)
    expect(Object.keys(query.mock.calls[1]![1])).toHaveLength(3)
  })

  it('splits batches before the encoded URL reaches its limit', async () => {
    const query = successfulQuery()
    const requests = Array.from({ length: 3 }, () => request('x'.repeat(2500)))
    await expect(
      readGitHubGraphQLBlobs({ query, requests }),
    ).resolves.toHaveLength(3)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('rejects a single request that exceeds the encoded URL limit', async () => {
    const query = successfulQuery()
    await expect(
      readGitHubGraphQLBlobs({ query, requests: [request('x'.repeat(8000))] }),
    ).rejects.toThrow('GitHub blob query exceeds the URL size limit')
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects GraphQL errors', async () => {
    const query = vi.fn<GitHubGraphQLQuery>(async () => ({
      errors: [{ message: 'permission denied' }, { message: 'not found' }],
    }))
    await expect(
      readGitHubGraphQLBlobs({ query, requests: [request()] }),
    ).rejects.toThrow('permission denied; not found')
  })

  it.each([
    [undefined, 'repository is missing or not visible'],
    [GRAPHQL_NULL, 'repository is missing or not visible'],
    ['not-an-object', 'repository is missing or not visible'],
  ])(
    'rejects an absent or invalid repository response: %s',
    async (repository, message) => {
      const query = vi.fn<GitHubGraphQLQuery>(async () => ({
        data: repository === undefined ? {} : { b0: repository },
      }))
      await expect(
        readGitHubGraphQLBlobs({ query, requests: [request()] }),
      ).rejects.toThrow(message)
    },
  )

  it('returns undefined for missing objects', async () => {
    const query = vi.fn<GitHubGraphQLQuery>(async () => ({
      data: { b0: { object: GRAPHQL_NULL }, b1: { object: undefined } },
    }))
    await expect(
      readGitHubGraphQLBlobs({
        query,
        requests: [request(), request('other.yml')],
      }),
    ).resolves.toEqual([undefined, undefined])
  })

  it.each([
    ['primitive object', 'not-a-blob'],
    ['non-blob Git object', { __typename: 'Commit' }],
  ])('rejects a %s', async (_label, object) => {
    const query = vi.fn<GitHubGraphQLQuery>(async () => ({
      data: { b0: { object } },
    }))
    await expect(
      readGitHubGraphQLBlobs({ query, requests: [request()] }),
    ).rejects.toThrow('object is not a Git blob')
  })

  it.each([
    [{ ...blob(), oid: undefined }],
    [{ ...blob(), byteSize: '14' }],
    [{ ...blob(), byteSize: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...blob(), byteSize: -1 }],
    [{ ...blob(), isBinary: 'false' }],
    [{ ...blob(), isTruncated: 'false' }],
    [{ ...blob(), text: GRAPHQL_NULL }],
  ])('rejects incomplete blob metadata: %s', async value => {
    const query = vi.fn<GitHubGraphQLQuery>(async () => ({
      data: { b0: { object: { __typename: 'Blob', ...value } } },
    }))
    await expect(
      readGitHubGraphQLBlobs({ query, requests: [request()] }),
    ).rejects.toThrow('GitHub returned incomplete blob metadata')
  })

  it('rejects a blob above the size limit', async () => {
    const query = vi.fn<GitHubGraphQLQuery>(async () => ({
      data: {
        b0: {
          object: {
            ...blob(''),
            __typename: 'Blob',
            byteSize: 256 * 1024 + 1,
          },
        },
      },
    }))
    await expect(
      readGitHubGraphQLBlobs({ query, requests: [request()] }),
    ).rejects.toThrow('blob exceeds the 262144-byte limit')
  })

  it.each([
    [{ isBinary: true, isTruncated: false }],
    [{ isBinary: false, isTruncated: true }],
  ])('rejects binary or truncated blobs: %s', async flags => {
    const query = vi.fn<GitHubGraphQLQuery>(async () => ({
      data: {
        b0: { object: { ...blob(), __typename: 'Blob', ...flags } },
      },
    }))
    await expect(
      readGitHubGraphQLBlobs({ query, requests: [request()] }),
    ).rejects.toThrow('blob is binary or truncated')
  })

  it('rejects a text payload whose UTF-8 size differs from metadata', async () => {
    const query = vi.fn<GitHubGraphQLQuery>(async () => ({
      data: {
        b0: {
          object: { ...blob('long text'), __typename: 'Blob', byteSize: 2 },
        },
      },
    }))
    await expect(
      readGitHubGraphQLBlobs({ query, requests: [request()] }),
    ).rejects.toThrow('blob byte size does not match GitHub metadata')
  })
})
