import { describe, expect, it } from 'vitest'

import { normalizePrimSchemaExamples } from '../../../scripts/repo/build/schema-examples.mts'

const examplePath = ['', 'home', 'user', 'monorepo', 'CLAUDE.md'].join('/')
const descriptionPrefix =
  'Glob patterns or absolute paths of CLAUDE.md files to exclude from loading.'

describe('normalizePrimSchemaExamples', () => {
  it('rewrites the SDK documentation example without changing functional paths', () => {
    const source = [
      `const runtimePath = ${JSON.stringify(examplePath)};`,
      `schema.describe(${JSON.stringify(`${descriptionPrefix} Examples: "${examplePath}", "**/code/CLAUDE.md"`)});`,
      `other.describe(${JSON.stringify(`Open "${examplePath}"`)});`,
    ].join('\n')
    const expected = [
      `const runtimePath = ${JSON.stringify(examplePath)};`,
      `schema.describe(${JSON.stringify(`${descriptionPrefix} Examples: "/workspace/example/CLAUDE.md", "**/code/CLAUDE.md"`)});`,
      `other.describe(${JSON.stringify(`Open "${examplePath}"`)});`,
    ].join('\n')

    const normalized = normalizePrimSchemaExamples(source)

    expect(normalized).toBe(expected)
    expect(normalizePrimSchemaExamples(normalized)).toBe(expected)
  })

  it('preserves a different path in the same description', () => {
    const source = `schema.describe(${JSON.stringify(`${descriptionPrefix} Examples: "/workspace/project/CLAUDE.md"`)});`

    expect(normalizePrimSchemaExamples(source)).toBe(source)
  })
})
