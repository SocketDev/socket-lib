import { isPlainObject } from '../objects/predicates.mjs'

export interface GitHubGraphQLBlobRequest {
  readonly owner: string
  readonly repository: string
  readonly commit: string
  readonly path: string
}

export interface GitHubGraphQLBlob {
  readonly oid: string
  readonly byteSize: number
  readonly isBinary: boolean
  readonly isTruncated: boolean
  readonly text: string
}

export interface GitHubGraphQLBlobResponse {
  readonly data?: Record<string, unknown> | undefined
  readonly errors?: ReadonlyArray<{ readonly message: string }> | undefined
}

export type GitHubGraphQLQuery = (
  query: string,
  variables: Record<string, string>,
) => Promise<GitHubGraphQLBlobResponse>

export interface GitHubGraphQLBlobReader {
  readonly readBlobs: (
    requests: readonly GitHubGraphQLBlobRequest[],
  ) => Promise<ReadonlyArray<GitHubGraphQLBlob | undefined>>
}

const maximumGraphQLUrlBytes = 7500
const maximumBlobBytes = 256 * 1024
const maximumBlobsPerQuery = 4

export function buildBlobQuery(requests: readonly GitHubGraphQLBlobRequest[]): {
  readonly query: string
  readonly variables: Record<string, string>
} {
  const variables: Record<string, string> = Object.create(null)
  const declarations: string[] = []
  const fields: string[] = []
  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index]!
    const owner = `owner${index}`
    const repository = `repository${index}`
    const expression = `expression${index}`
    variables[owner] = request.owner
    variables[repository] = request.repository
    variables[expression] = `${request.commit}:${request.path}`
    declarations.push(
      `$${owner}: String!`,
      `$${repository}: String!`,
      `$${expression}: String!`,
    )
    fields.push(
      `b${index}: repository(owner: $${owner}, name: $${repository}) { object(expression: $${expression}) { __typename ... on Blob { oid byteSize isBinary isTruncated text } } }`,
    )
  }
  return {
    query: `query(${declarations.join(', ')}) { ${fields.join(' ')} }`,
    variables,
  }
}

export function graphQLUrlLength(input: {
  readonly query: string
  readonly variables: Record<string, string>
}): number {
  const url = new URL('https://api.github.com/graphql')
  url.searchParams.set('query', input.query)
  url.searchParams.set('variables', JSON.stringify(input.variables))
  return Buffer.byteLength(url.toString(), 'utf8')
}

export function parseBlob(
  value: Record<string, unknown>,
  request: GitHubGraphQLBlobRequest,
): GitHubGraphQLBlob {
  const { oid, byteSize, isBinary, isTruncated, text } = value
  if (
    typeof oid !== 'string' ||
    typeof byteSize !== 'number' ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 0 ||
    typeof isBinary !== 'boolean' ||
    typeof isTruncated !== 'boolean' ||
    typeof text !== 'string'
  ) {
    throw new Error(
      `${request.owner}/${request.repository}:${request.path}: GitHub returned incomplete blob metadata`,
    )
  }
  if (byteSize > maximumBlobBytes) {
    throw new Error(
      `${request.owner}/${request.repository}:${request.path}: blob exceeds the ${maximumBlobBytes}-byte limit`,
    )
  }
  if (isBinary || isTruncated) {
    throw new Error(
      `${request.owner}/${request.repository}:${request.path}: blob is binary or truncated`,
    )
  }
  if (Buffer.byteLength(text, 'utf8') !== byteSize) {
    throw new Error(
      `${request.owner}/${request.repository}:${request.path}: blob byte size does not match GitHub metadata`,
    )
  }
  return { oid, byteSize, isBinary, isTruncated, text }
}

export async function readGitHubGraphQLBlobs(config: {
  readonly query: GitHubGraphQLQuery
  readonly requests: readonly GitHubGraphQLBlobRequest[]
}): Promise<ReadonlyArray<GitHubGraphQLBlob | undefined>> {
  const output: Array<GitHubGraphQLBlob | undefined> = []
  for (let start = 0; start < config.requests.length;) {
    const batch: GitHubGraphQLBlobRequest[] = []
    while (
      start + batch.length < config.requests.length &&
      batch.length < maximumBlobsPerQuery
    ) {
      const request = config.requests[start + batch.length]!
      const candidate = [...batch, request]
      if (
        graphQLUrlLength(buildBlobQuery(candidate)) > maximumGraphQLUrlBytes
      ) {
        break
      }
      batch.push(request)
    }
    if (batch.length === 0) {
      throw new Error('GitHub blob query exceeds the URL size limit')
    }
    const { query, variables } = buildBlobQuery(batch)
    const response = await config.query(query, variables)
    if (response.errors?.length) {
      throw new Error(response.errors.map(error => error.message).join('; '))
    }
    for (let index = 0; index < batch.length; index += 1) {
      const request = batch[index]!
      const repository = response.data?.[`b${index}`]
      if (!isPlainObject(repository)) {
        throw new Error(
          `${request.owner}/${request.repository}: blob repository is missing or not visible`,
        )
      }
      const object = repository['object']
      if (object === null || object === undefined) {
        output.push(undefined)
        continue
      }
      if (!isPlainObject(object) || object['__typename'] !== 'Blob') {
        throw new Error(
          `${request.owner}/${request.repository}:${request.path}: object is not a Git blob`,
        )
      }
      output.push(parseBlob(object, request))
    }
    start += batch.length
  }
  return output
}
