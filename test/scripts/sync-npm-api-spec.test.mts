/**
 * @file Specs for the npm-spec pin refresher. The network halves are not
 *   driven here - what is driven is everything that decides WHAT gets written
 *   and WHETHER a re-fetch is trustworthy: the pin round-trip, the sha256
 *   integrity vocabulary, the head-cache TTL, and the report wording.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildSpecInventory,
  GENERATED_BANNER,
  readSpecInventory,
  writeSpecInventory,
} from '../../scripts/repo/npm-api-spec/inventory.mts'
import {
  digestOf,
  isFullCommitSha,
  readSpecPin,
  refLabelFor,
  writeSpecPin,
} from '../../scripts/repo/npm-api-spec/pin.mts'
import {
  cacheFileFor,
  HEAD_TTL_MS,
  readCachedSpecFile,
  readHeadCache,
  specFileDigests,
  specIntegrityOf,
  verifyAgainstPin,
  writeCachedSpecFile,
} from '../../scripts/repo/npm-api-spec/spec-fetch.mts'
import { describeSyncResult } from '../../scripts/repo/sync-npm-api-spec.mts'

import type { SpecPin } from '../../scripts/repo/npm-api-spec/pin.mts'
import type { FetchedSpec } from '../../scripts/repo/npm-api-spec/spec-fetch.mts'
import type { SyncResult } from '../../scripts/repo/sync-npm-api-spec.mts'

const EXAMPLE_SHA = 'a'.repeat(40)

const EXAMPLE_SPEC_YAML = `
paths:
  /-/example/{orgName}/thing:
    get:
      operationId: getExampleThing
      summary: Read an example thing
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  total:
                    type: integer
`

function scratchDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'npm-api-spec-'))
}

function exampleSpec(): FetchedSpec {
  return {
    files: new Map([
      ['api/merge-config.yaml', 'inputs:\n  - inputFile: example.yaml\n'],
      ['api/example.yaml', EXAMPLE_SPEC_YAML],
    ]),
    sha: EXAMPLE_SHA,
  }
}

describe('digestOf', () => {
  it('writes the one checksum vocabulary the fleet uses', () => {
    expect(digestOf('example')).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('answers the same digest for the same bytes', () => {
    expect(digestOf('example')).toBe(digestOf('example'))
  })

  it('answers a different digest for different bytes', () => {
    expect(digestOf('example')).not.toBe(digestOf('example '))
  })
})

describe('isFullCommitSha', () => {
  it('accepts a 40-character lowercase hex sha', () => {
    expect(isFullCommitSha(EXAMPLE_SHA)).toBe(true)
  })

  it('rejects a short sha', () => {
    expect(isFullCommitSha('a'.repeat(7))).toBe(false)
  })

  it('rejects a branch name', () => {
    expect(isFullCommitSha('main')).toBe(false)
  })

  it('rejects an upper-case sha', () => {
    expect(isFullCommitSha('A'.repeat(40))).toBe(false)
  })
})

describe('refLabelFor', () => {
  it('spells the branch-pin label as branch plus read date', () => {
    expect(refLabelFor('main', new Date('2026-08-25T12:00:00Z'))).toBe(
      'main 2026-08-25',
    )
  })
})

describe('the pin round-trip', () => {
  function examplePin(): SpecPin {
    return {
      files: [{ integrity: digestOf('example'), path: 'api/example.yaml' }],
      generatedBy: 'scripts/repo/sync-npm-api-spec.mts --refresh',
      refLabel: 'main 2026-08-25',
      repo: 'npm/api-documentation',
      sha: EXAMPLE_SHA,
    }
  }

  it('reads back exactly what it wrote', () => {
    const pinPath = path.join(scratchDir(), 'spec-pin.json')
    writeSpecPin(examplePin(), { pinPath })
    expect(readSpecPin({ pinPath })).toStrictEqual(examplePin())
  })

  it('answers undefined for a pin that is not there', () => {
    expect(
      readSpecPin({ pinPath: path.join(scratchDir(), 'absent.json') }),
    ).toBe(undefined)
  })

  it('answers undefined for a pin that is not JSON', () => {
    const pinPath = path.join(scratchDir(), 'spec-pin.json')
    writeFileSync(pinPath, 'not json at all')
    expect(readSpecPin({ pinPath })).toBe(undefined)
  })

  it('answers undefined for JSON missing the sha', () => {
    const pinPath = path.join(scratchDir(), 'spec-pin.json')
    writeFileSync(pinPath, JSON.stringify({ files: [] }))
    expect(readSpecPin({ pinPath })).toBe(undefined)
  })
})

describe('verifyAgainstPin', () => {
  it('reports nothing when every file hashes to its recorded digest', () => {
    const spec = exampleSpec()
    expect(verifyAgainstPin(spec, specFileDigests(spec))).toStrictEqual([])
  })

  it('names the file whose bytes changed under the same sha', () => {
    const spec = exampleSpec()
    const pinned = specFileDigests(spec).map(entry =>
      entry.path === 'api/example.yaml'
        ? { integrity: digestOf('something else'), path: entry.path }
        : entry,
    )
    expect(verifyAgainstPin(spec, pinned)).toStrictEqual(['api/example.yaml'])
  })

  it('names a pinned file the fetch never returned', () => {
    const spec = exampleSpec()
    const pinned = [{ integrity: digestOf('gone'), path: 'api/vanished.yaml' }]
    expect(verifyAgainstPin(spec, pinned)).toStrictEqual(['api/vanished.yaml'])
  })
})

describe('specIntegrityOf', () => {
  it('changes when any input file changes', () => {
    const before = specIntegrityOf(exampleSpec())
    const mutated = exampleSpec()
    const files = new Map(mutated.files)
    files.set('api/example.yaml', `${EXAMPLE_SPEC_YAML}\n# edited\n`)
    expect(specIntegrityOf({ files, sha: mutated.sha })).not.toBe(before)
  })
})

describe('the spec file cache', () => {
  it('flattens a nested spec path into one cache level', () => {
    const file = cacheFileFor(EXAMPLE_SHA, 'api/registry/example.yaml', {
      cacheDir: '/path/to/example-cache',
    })
    expect(path.basename(file)).toBe('api__registry__example.yaml')
  })

  it('reads back exactly what it wrote', () => {
    const dir = scratchDir()
    writeCachedSpecFile('api/example.yaml', EXAMPLE_SHA, 'body', {
      cacheDir: dir,
    })
    expect(
      readCachedSpecFile('api/example.yaml', EXAMPLE_SHA, { cacheDir: dir }),
    ).toBe('body')
  })

  it('answers undefined for a path that was never cached', () => {
    expect(
      readCachedSpecFile('api/absent.yaml', EXAMPLE_SHA, {
        cacheDir: scratchDir(),
      }),
    ).toBe(undefined)
  })
})

describe('readHeadCache', () => {
  it('answers a head read inside the TTL', () => {
    const file = path.join(scratchDir(), 'head.json')
    writeFileSync(
      file,
      JSON.stringify({ readAt: Date.now(), sha: EXAMPLE_SHA }),
    )
    expect(readHeadCache(file)).toBe(EXAMPLE_SHA)
  })

  it('treats a head read past the TTL as a miss', () => {
    const file = path.join(scratchDir(), 'head.json')
    writeFileSync(
      file,
      JSON.stringify({
        readAt: Date.now() - HEAD_TTL_MS - 1,
        sha: EXAMPLE_SHA,
      }),
    )
    expect(readHeadCache(file)).toBe(undefined)
  })

  it('treats a corrupt entry as a miss, never a failure', () => {
    const file = path.join(scratchDir(), 'head.json')
    writeFileSync(file, '{{{')
    expect(readHeadCache(file)).toBe(undefined)
  })

  it('treats an absent file as a miss', () => {
    expect(readHeadCache(path.join(scratchDir(), 'head.json'))).toBe(undefined)
  })
})

describe('the generated inventory', () => {
  it('projects the composed spec into sorted endpoints', () => {
    const inventory = buildSpecInventory(exampleSpec())
    expect(inventory.endpoints.map(e => e.operationId)).toStrictEqual([
      'getExampleThing',
    ])
    expect(inventory.endpoints[0]?.responseFields).toStrictEqual(['total'])
  })

  it('reads back exactly what it wrote', () => {
    const file = path.join(scratchDir(), 'spec-inventory.generated.json')
    const inventory = buildSpecInventory(exampleSpec())
    writeSpecInventory(inventory, { inventoryPath: file })
    expect(readSpecInventory({ inventoryPath: file })).toStrictEqual(inventory)
  })

  it('carries the do-not-hand-edit banner', () => {
    const file = path.join(scratchDir(), 'spec-inventory.generated.json')
    writeSpecInventory(buildSpecInventory(exampleSpec()), {
      inventoryPath: file,
    })
    expect(readSpecInventory({ inventoryPath: file })).toBeTruthy()
    expect(GENERATED_BANNER).toContain('Do not hand-edit')
  })

  it('answers undefined for an inventory that is not there', () => {
    expect(
      readSpecInventory({
        inventoryPath: path.join(scratchDir(), 'absent.json'),
      }),
    ).toBe(undefined)
  })
})

describe('describeSyncResult', () => {
  function result(overrides: Partial<SyncResult>): SyncResult {
    return {
      endpoints: 33,
      mismatched: [],
      mode: 'verify',
      reachable: true,
      sha: EXAMPLE_SHA,
      wrote: false,
      ...overrides,
    }
  }

  it('says nothing was written when the spec could not be read', () => {
    const text = describeSyncResult(result({ reachable: false })).join('\n')
    expect(text).toContain('nothing was written')
  })

  it('names every file whose bytes changed under the same sha', () => {
    const text = describeSyncResult(
      result({ mismatched: ['api/example.yaml'] }),
    ).join('\n')
    expect(text).toContain('INTEGRITY FAILURE')
    expect(text).toContain('api/example.yaml')
  })

  it('reports what a refresh wrote', () => {
    const text = describeSyncResult(
      result({ mode: 'refresh', wrote: true }),
    ).join('\n')
    expect(text).toContain('spec-inventory.generated.json')
  })

  it('reports the endpoint count on a clean verify', () => {
    expect(describeSyncResult(result({})).join('\n')).toContain(
      '33 endpoint(s)',
    )
  })
})
