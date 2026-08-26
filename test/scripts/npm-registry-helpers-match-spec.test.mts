/**
 * @file Specs for the npm-spec drift gate. Everything driven here is pure: the
 *   AST read of a helper module, the spec-side field extractor, the diff, and
 *   the renderer. No network, no fixture downloads - the spec side is built
 *   from small inline YAML documents so a test states exactly the shape it is
 *   about.
 */

import { describe, expect, it } from 'vitest'

import {
  endpointKey,
  fieldIsCovered,
  normalizePathTemplate,
  reportDrift,
  splitFieldPath,
} from '../../scripts/repo/npm-api-spec/drift.mts'
import { readHelperModule } from '../../scripts/repo/npm-api-spec/helper-ast.mts'
import { isFailing } from '../../scripts/repo/check/npm-registry-helpers-match-spec.mts'
import {
  renderDriftLines,
  renderUncovered,
} from '../../scripts/repo/npm-api-spec/render.mts'
import {
  collectEndpoints,
  escapeFieldSegment,
  extractSchemaFields,
  mergeConfigInputs,
  parseSpecDocuments,
  resolveRefFile,
} from '../../scripts/repo/npm-api-spec/spec-model.mts'

import type { HelperModule } from '../../scripts/repo/npm-api-spec/helper-ast.mts'
import type { SpecInventory } from '../../scripts/repo/npm-api-spec/spec-model.mts'
import type { SpecCheckResult } from '../../scripts/repo/npm-api-spec/render.mts'

const HELPER_SOURCE = `
import { npmAuthHeaders, resolveRegistry, sendJsonRequest } from './registry-client.mjs'

export interface ExampleRecord {
  readonly links?: Readonly<Record<string, string>> | undefined
  readonly name?: string | undefined
}

export async function fetchExampleTeamGrants(
  orgName: string,
  teamName: string,
  options: { registry?: string | undefined },
): Promise<unknown> {
  const registry = resolveRegistry(options.registry)
  const path = \`\${encodeURIComponent(orgName)}/\${encodeURIComponent(teamName)}\`
  return await fetchRecord(\`\${registry}/-/team/\${path}/package\`, options)
}

export async function setExampleAccess(
  packageName: string,
  options: { registry?: string | undefined },
): Promise<unknown> {
  const registry = resolveRegistry(options.registry)
  const body: Record<string, unknown> = {}
  body['publish_requires_tfa'] = true
  return await sendJsonRequest(
    \`\${registry}/-/package/\${encodeRegistryName(packageName)}/access\`,
    { body: JSON.stringify(body), headers: npmAuthHeaders(options), method: 'POST' },
    options,
  )
}
`

const SPEC_YAML = `
components:
  responses:
    Grants:
      content:
        application/json:
          schema:
            type: object
            additionalProperties:
              type: string
paths:
  /-/team/{orgName}/{teamName}/package:
    get:
      operationId: getTeamPackageGrants
      summary: Get all packages for a team
      responses:
        '200':
          $ref: '#/components/responses/Grants'
  /-/package/{escapedPackageName}/access:
    post:
      operationId: setPackageAccess
      summary: Sets the various access levels for a package
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                publish_requires_tfa:
                  type: boolean
                automation_token_overrides_tfa:
                  type: boolean
      responses:
        '200':
          description: ok
  /-/example/{orgName}/nobody-implements-this:
    get:
      operationId: getUnimplemented
      summary: An endpoint with no helper
      responses:
        '200':
          description: ok
`

function exampleModule(): HelperModule {
  const module = readHelperModule('registry-example.mts', HELPER_SOURCE)
  if (!module) {
    throw new Error('the example helper module failed to parse')
  }
  return module
}

function exampleInventory(): SpecInventory {
  const docs = parseSpecDocuments(
    new Map([['api/registry.npmjs.com/example.yaml', SPEC_YAML]]),
  )
  return {
    endpoints: collectEndpoints(docs),
    sha: '0'.repeat(40),
    specIntegrity: 'sha256:example',
  }
}

describe('normalizePathTemplate', () => {
  it('reduces every named parameter to one placeholder', () => {
    expect(normalizePathTemplate('/-/team/{orgName}/{teamName}/package')).toBe(
      '/-/team/{}/{}/package',
    )
  })

  it('keeps a literal segment distinct from a parameter segment', () => {
    expect(normalizePathTemplate('/-/org/{orgName}/team')).toBe(
      '/-/org/{}/team',
    )
    expect(normalizePathTemplate('/-/org/{orgName}/{teamName}')).toBe(
      '/-/org/{}/{}',
    )
  })

  it('leaves a path with no parameter alone', () => {
    expect(normalizePathTemplate('/-/v1/search')).toBe('/-/v1/search')
  })

  it('does not lose text after an unclosed brace', () => {
    expect(normalizePathTemplate('/-/broken/{orgName')).toBe(
      '/-/broken/{orgName',
    )
  })
})

describe('endpointKey', () => {
  it('upper-cases the method and normalizes the path', () => {
    expect(endpointKey('get', '/-/org/{orgName}/user')).toBe(
      'GET /-/org/{}/user',
    )
  })

  it('matches a spec path against an AST-derived path', () => {
    expect(endpointKey('GET', '/-/package/{escapedPackageName}/trust')).toBe(
      endpointKey('GET', '/-/package/{}/trust'),
    )
  })
})

describe('splitFieldPath', () => {
  it('drops the array-hop markers', () => {
    expect(splitFieldPath('objects[].package.name')).toStrictEqual([
      'objects',
      'package',
      'name',
    ])
  })

  it('keeps an escaped dot inside one segment', () => {
    expect(splitFieldPath('claims.oidc\\.circleci\\.com/org-id')).toStrictEqual(
      ['claims', 'oidc.circleci.com/org-id'],
    )
  })

  it('answers a single segment for a flat field', () => {
    expect(splitFieldPath('shasum')).toStrictEqual(['shasum'])
  })
})

describe('escapeFieldSegment', () => {
  it('escapes every dot in a property name', () => {
    expect(escapeFieldSegment('oidc.circleci.com/org-id')).toBe(
      'oidc\\.circleci\\.com/org-id',
    )
  })

  it('leaves a dotless name alone', () => {
    expect(escapeFieldSegment('shasum')).toBe('shasum')
  })
})

describe('extractSchemaFields', () => {
  it('walks nested objects and arrays into dotted paths', () => {
    const schema = {
      type: 'object',
      properties: {
        objects: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    }
    expect(extractSchemaFields(schema)).toStrictEqual([
      'objects',
      'objects[].name',
    ])
  })

  it('unions every allOf branch', () => {
    const schema = {
      allOf: [
        { type: 'object', properties: { left: { type: 'string' } } },
        { type: 'object', properties: { right: { type: 'string' } } },
      ],
    }
    expect(extractSchemaFields(schema).toSorted()).toStrictEqual([
      'left',
      'right',
    ])
  })

  it('answers nothing for a schema with no properties', () => {
    expect(extractSchemaFields({ type: 'string' })).toStrictEqual([])
    expect(extractSchemaFields(undefined)).toStrictEqual([])
  })
})

describe('mergeConfigInputs', () => {
  it('reads the input list and roots it under api/', () => {
    const text =
      'inputs:\n  - inputFile: base.yaml\n  - inputFile: registry/example.yaml\n'
    expect(mergeConfigInputs(text)).toStrictEqual([
      'api/base.yaml',
      'api/registry/example.yaml',
    ])
  })

  it('answers an empty list for a manifest with no inputs', () => {
    expect(mergeConfigInputs('output: ../openapi.yaml\n')).toStrictEqual([])
  })
})

describe('resolveRefFile', () => {
  const docs = new Map<string, unknown>([
    ['api/shared-components.yaml', {}],
    ['api/registry.npmjs.com/access.yaml', {}],
  ])

  it('resolves a repo-root-relative ref', () => {
    expect(resolveRefFile('./api/shared-components.yaml', docs)).toBe(
      'api/shared-components.yaml',
    )
  })

  it('falls back to a basename match for a sibling-relative ref', () => {
    expect(resolveRefFile('../shared-components.yaml', docs)).toBe(
      'api/shared-components.yaml',
    )
  })

  it('answers undefined for a file that was never fetched', () => {
    expect(resolveRefFile('./api/absent.yaml', docs)).toBe(undefined)
  })
})

describe('readHelperModule', () => {
  it('expands a local template const into two parameter holes', () => {
    const endpoints = exampleModule().endpoints
    const grants = endpoints.find(e => e.helper === 'fetchExampleTeamGrants')
    expect(grants?.path).toBe('/-/team/{}/{}/package')
  })

  it('defaults a helper with no method literal to GET', () => {
    const endpoints = exampleModule().endpoints
    const grants = endpoints.find(e => e.helper === 'fetchExampleTeamGrants')
    expect(grants?.method).toBe('GET')
  })

  it('reads the method literal when the helper carries one', () => {
    const endpoints = exampleModule().endpoints
    const access = endpoints.find(e => e.helper === 'setExampleAccess')
    expect(access?.method).toBe('POST')
  })

  it('records a computed string key as a declared name', () => {
    expect(exampleModule().declaredNames.has('publish_requires_tfa')).toBe(true)
  })

  it('marks a Record-typed property as open', () => {
    expect(exampleModule().openTypedNames.has('links')).toBe(true)
    expect(exampleModule().openTypedNames.has('name')).toBe(false)
  })

  it('answers undefined for source that will not parse', () => {
    expect(readHelperModule('broken.mts', 'export function (')).toBe(undefined)
  })
})

describe('fieldIsCovered', () => {
  it('covers a field whose leaf name is declared', () => {
    expect(fieldIsCovered('name', exampleModule())).toBe(true)
  })

  it('covers every descendant of an open-typed ancestor', () => {
    expect(fieldIsCovered('links.homepage', exampleModule())).toBe(true)
    expect(fieldIsCovered('links.deep.nested', exampleModule())).toBe(true)
  })

  it('reports a field with no declared leaf and no open ancestor', () => {
    expect(fieldIsCovered('readme', exampleModule())).toBe(false)
  })
})

describe('reportDrift', () => {
  it('names the spec endpoint that has no helper', () => {
    const report = reportDrift(exampleInventory(), [exampleModule()])
    expect(report.uncovered.map(e => e.operationId)).toStrictEqual([
      'getUnimplemented',
    ])
  })

  it('counts the endpoints that do have a helper', () => {
    const report = reportDrift(exampleInventory(), [exampleModule()])
    expect(report.matchedEndpoints).toBe(2)
  })

  it('reports a request field the module never names', () => {
    const report = reportDrift(exampleInventory(), [exampleModule()])
    expect(report.missingFields.map(f => f.field)).toStrictEqual([
      'automation_token_overrides_tfa',
    ])
  })

  it('reports every helper route when the spec is empty', () => {
    const empty: SpecInventory = {
      endpoints: [],
      sha: '0'.repeat(40),
      specIntegrity: '',
    }
    const report = reportDrift(empty, [exampleModule()])
    expect(report.undocumented).toHaveLength(2)
    expect(report.matchedEndpoints).toBe(0)
  })
})

describe('isFailing', () => {
  function resultWith(overrides: Partial<SpecCheckResult>): SpecCheckResult {
    return {
      drift: reportDrift(exampleInventory(), [exampleModule()]),
      headSha: undefined,
      pinIsStale: undefined,
      pinnedSha: '0'.repeat(40),
      ready: true,
      specEndpoints: 3,
      ...overrides,
    }
  }

  it('fails on an uncovered endpoint even without --strict', () => {
    expect(isFailing(resultWith({}))).toBe(true)
  })

  it('passes on field gaps alone without --strict', () => {
    const drift = reportDrift(exampleInventory(), [exampleModule()])
    const fieldsOnly = { ...drift, uncovered: [] }
    expect(isFailing(resultWith({ drift: fieldsOnly }))).toBe(false)
  })

  it('fails on field gaps under --strict', () => {
    const drift = reportDrift(exampleInventory(), [exampleModule()])
    const fieldsOnly = { ...drift, uncovered: [] }
    expect(isFailing(resultWith({ drift: fieldsOnly }), { strict: true })).toBe(
      true,
    )
  })

  it('never fails when the inventory is missing', () => {
    expect(
      isFailing(resultWith({ drift: undefined, ready: false }), {
        strict: true,
      }),
    ).toBe(false)
  })
})

describe('renderDriftLines', () => {
  function result(): SpecCheckResult {
    return {
      drift: reportDrift(exampleInventory(), [exampleModule()]),
      headSha: 'f'.repeat(40),
      pinIsStale: true,
      pinnedSha: '0'.repeat(40),
      ready: true,
      specEndpoints: 3,
    }
  }

  it('names the uncovered route and its operation id', () => {
    const text = renderUncovered(result()).join('\n')
    expect(text).toContain('/-/example/{orgName}/nobody-implements-this')
    expect(text).toContain('getUnimplemented')
  })

  it('says the pin is behind when the head has moved', () => {
    expect(renderDriftLines(result()).join('\n')).toContain(
      "npm's main has moved past the pin",
    )
  })

  it('reports a skip when no inventory is committed', () => {
    const skipped: SpecCheckResult = {
      drift: undefined,
      headSha: undefined,
      pinIsStale: undefined,
      pinnedSha: undefined,
      ready: false,
      specEndpoints: 0,
    }
    expect(renderDriftLines(skipped).join('\n')).toContain('skipped')
  })

  it('always ends with the coverage summary', () => {
    const lines = renderDriftLines(result())
    expect(lines.at(-1)).toContain('2/3 spec endpoint(s) have a helper')
  })
})
