import { describe, expect, it } from 'vitest'

import { findSbomAnomalies } from '../../../src/packages/sbom-anomalies.mts'

describe('findSbomAnomalies', () => {
  it('flags a duplicate-version component', () => {
    const components = 'pkg:npm/a@1.0.0\npkg:npm/a@2.0.0'
    const anomalies = findSbomAnomalies(components)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toContain('Duplicate versions of a')
  })

  it('flags a deprecated component', () => {
    const components = 'pkg:npm/old@1.0.0 (deprecated)'
    const anomalies = findSbomAnomalies(components)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toContain('deprecated')
  })

  it('flags a git dependency with no pinned tag', () => {
    const components = 'pkg:npm/tool@1.0.0 (git dependency, no tag)'
    const anomalies = findSbomAnomalies(components)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toContain('no pinned tag')
  })

  it('skips non-pkg lines', () => {
    const components = 'not a package line\npkg:npm/a@1.0.0'
    expect(findSbomAnomalies(components)).toHaveLength(0)
  })

  it('handles an empty component list', () => {
    expect(findSbomAnomalies('')).toHaveLength(0)
  })

  it('sorts duplicate findings before marker findings', () => {
    const components =
      'pkg:npm/old@1.0.0 (deprecated)\npkg:npm/a@1.0.0\npkg:npm/a@2.0.0'
    const anomalies = findSbomAnomalies(components)
    expect(anomalies[0]).toContain('Duplicate versions')
    expect(anomalies[1]).toContain('deprecated')
  })
})
