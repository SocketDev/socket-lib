import { describe, expect, it } from 'vitest'

import { shapeEndpoint } from '../../../scripts/repo/npm-api-spec/spec-model.mts'

function mediaFields(field: string) {
  return {
    __proto__: null,
    schema: { type: 'object', properties: { [field]: { type: 'string' } } },
  }
}

describe('shapeEndpoint media fields', () => {
  it('unions request formats and successful responses while excluding errors', () => {
    const endpoint = shapeEndpoint(
      {
        operationId: 'createExample',
        requestBody: {
          content: {
            'application/json': mediaFields('name'),
            'text/plain': mediaFields('description'),
          },
        },
        responses: {
          '200': { content: { 'application/json': mediaFields('identifier') } },
          '201': {
            content: {
              'application/json': mediaFields('identifier'),
              'text/plain': mediaFields('status'),
            },
          },
          '204': {},
          '400': { content: { 'application/json': mediaFields('error') } },
        },
      },
      new Map(),
      'example.yaml',
      'post',
      '/examples',
    )
    expect(endpoint.requestFields).toEqual(['description', 'name'])
    expect(endpoint.responseFields).toEqual(['identifier', 'status'])
    expect(endpoint.method).toBe('POST')
  })

  it('accepts an operation without request or response schemas', () => {
    const endpoint = shapeEndpoint(
      {},
      new Map(),
      'example.yaml',
      'get',
      '/examples',
    )
    expect(endpoint.requestFields).toEqual([])
    expect(endpoint.responseFields).toEqual([])
  })
})
