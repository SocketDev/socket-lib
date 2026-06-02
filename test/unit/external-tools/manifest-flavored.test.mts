import { describe, expect, test } from 'vitest'

import { tryParseFlavored } from '../../../src/external-tools/manifest'

// SRI integrity per src/integrity.ts: prefix `sha512-` followed by base64.
const VALID_INTEGRITY = 'sha512-' + 'A'.repeat(86) + '=='

describe.sequential('tryParseFlavored', () => {
  test('returns undefined when no inner objects have platforms', () => {
    expect(
      tryParseFlavored({ description: 'x', version: '1' }, 'rust'),
    ).toBeUndefined()
  })

  test('returns a flavored entry with version/description/release strings', () => {
    const result = tryParseFlavored(
      {
        description: 'sfw',
        version: '1.0.0',
        release: 'asset',
        free: {
          repository: 'github:socket/sfw-free',
          platforms: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.description).toBe('sfw')
    expect(result?.version).toBe('1.0.0')
    expect(result?.release).toBe('asset')
    expect(result?.flavors['free']?.repository).toBe('github:socket/sfw-free')
  })

  test('skips flavor candidates without a repository', () => {
    const result = tryParseFlavored(
      {
        // free has no `repository` so it is NOT recognized as a flavor.
        free: {
          platforms: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result).toBeUndefined()
  })

  test('defaults description/version/release to empty strings when missing', () => {
    const result = tryParseFlavored(
      {
        free: {
          repository: 'github:socket/sfw-free',
          platforms: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.description).toBe('')
    expect(result?.version).toBe('')
    expect(result?.release).toBe('')
  })

  test('preserves notes array when present', () => {
    const result = tryParseFlavored(
      {
        description: 'sfw',
        notes: ['n1'],
        free: {
          repository: 'r',
          platforms: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.notes).toEqual(['n1'])
  })
})

describe.sequential('tryParseFlavored — skip invalid flavor candidates', () => {
  test('skips a flavor candidate whose platforms field is not an object', () => {
    const result = tryParseFlavored(
      {
        description: 'sfw',
        // free has bad platforms shape → skipped.
        free: {
          repository: 'github:socket/sfw-free',
          platforms: 'not-an-object',
        },
        // enterprise is valid → kept.
        enterprise: {
          repository: 'github:socket/sfw-enterprise',
          platforms: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.flavors['free']).toBeUndefined()
    expect(result?.flavors['enterprise']).toBeDefined()
  })

  test('omits binaryName when the field is not a string', () => {
    const result = tryParseFlavored(
      {
        description: 'sfw',
        free: {
          repository: 'github:socket/sfw-free',
          binaryName: 42,
          platforms: {
            'linux-x64': { asset: 'a', integrity: VALID_INTEGRITY },
          },
        },
      },
      'sfw',
    )
    expect(result?.flavors['free']?.binaryName).toBeUndefined()
  })
})
