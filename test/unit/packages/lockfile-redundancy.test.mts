import { describe, expect, it } from 'vitest'

import { findRedundantPackages } from '../../../src/packages/lockfile-redundancy.mts'

describe('findRedundantPackages', () => {
  it('flags a package installed at two versions', () => {
    const lockfile = JSON.stringify({
      packages: {
        'node_modules/left-pad': { version: '1.0.0' },
        'node_modules/example-tool/node_modules/left-pad': { version: '2.0.0' },
      },
    })
    const findings = findRedundantPackages(lockfile)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.name).toBe('left-pad')
    expect(findings[0]!.reason).toContain('2 versions')
  })

  it('ignores a single-version install tree', () => {
    const lockfile = JSON.stringify({
      packages: {
        'node_modules/left-pad': { version: '1.0.0' },
        'node_modules/example-tool': { version: '2.0.0' },
      },
    })
    expect(findRedundantPackages(lockfile)).toHaveLength(0)
  })

  it('flags the curated lodash/lodash-es pair', () => {
    const lockfile = JSON.stringify({
      packages: {
        'node_modules/lodash': { version: '4.17.21' },
        'node_modules/lodash-es': { version: '4.17.21' },
      },
    })
    const findings = findRedundantPackages(lockfile)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.name).toBe('lodash')
    expect(findings[0]!.reason).toContain('functional duplicates')
  })

  it('skips entries with no version', () => {
    const lockfile = JSON.stringify({
      packages: {
        'node_modules/left-pad': {},
        'node_modules/left-pad-es': { version: '1.0.0' },
      },
    })
    expect(findRedundantPackages(lockfile)).toHaveLength(0)
  })

  it('handles an empty lockfile', () => {
    expect(findRedundantPackages('{}')).toHaveLength(0)
  })

  it('sorts findings by name', () => {
    const lockfile = JSON.stringify({
      packages: {
        'node_modules/example-tool': { version: '1.0.0' },
        'node_modules/example-app/node_modules/example-tool': {
          version: '2.0.0',
        },
        'node_modules/left-pad': { version: '1.0.0' },
        'node_modules/example-lib/node_modules/left-pad': { version: '2.0.0' },
      },
    })
    const findings = findRedundantPackages(lockfile)
    expect(findings[0]!.name).toBe('example-tool')
    expect(findings[1]!.name).toBe('left-pad')
  })
})
