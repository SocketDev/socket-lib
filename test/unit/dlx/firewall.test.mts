import { describe, expect, test } from 'vitest'

import { checkFirewallPurls, npmPurl } from '../../../src/dlx/firewall'

describe.sequential('dlx/firewall — npmPurl', () => {
  test('builds an unscoped npm PURL', () => {
    expect(npmPurl('lodash', '4.17.21')).toBe('pkg:npm/lodash@4.17.21')
  })

  test('encodes leading "@" of scoped names as %40', () => {
    expect(npmPurl('@scope/pkg', '1.0.0')).toBe('pkg:npm/%40scope/pkg@1.0.0')
  })

  test('encodes "+" in version as %2B (PURL spec)', () => {
    expect(npmPurl('lodash', '1.0.0+build.5')).toBe(
      'pkg:npm/lodash@1.0.0%2Bbuild.5',
    )
  })

  test('encodes multiple "+" characters in version', () => {
    expect(npmPurl('lodash', '1.0+a+b')).toBe('pkg:npm/lodash@1.0%2Ba%2Bb')
  })

  test('preserves the bare "/" in scoped names (URL-safe)', () => {
    expect(npmPurl('@scope/sub-pkg', '2.3.4')).toBe(
      'pkg:npm/%40scope/sub-pkg@2.3.4',
    )
  })
})

describe.sequential('dlx/firewall — checkFirewallPurls', () => {
  test('returns immediately when idealTree is missing (no HTTP)', async () => {
    // No idealTree property → undefined → early return.
    const fakeArb = { idealTree: undefined } as unknown as Parameters<
      typeof checkFirewallPurls
    >[0]
    await expect(
      checkFirewallPurls(fakeArb, 'test-pkg'),
    ).resolves.toBeUndefined()
  })

  test('returns immediately when inventory has no non-root nodes', async () => {
    const fakeArb = {
      idealTree: {
        inventory: {
          values: () => [],
        },
      },
    } as unknown as Parameters<typeof checkFirewallPurls>[0]
    await expect(
      checkFirewallPurls(fakeArb, 'test-pkg'),
    ).resolves.toBeUndefined()
  })

  test('skips nodes with isProjectRoot=true', async () => {
    // Only a root node in the tree → purls list stays empty → no HTTP.
    const fakeArb = {
      idealTree: {
        inventory: {
          values: () => [
            { isProjectRoot: true, package: { name: 'root', version: '1.0.0' } },
          ],
        },
      },
    } as unknown as Parameters<typeof checkFirewallPurls>[0]
    await expect(
      checkFirewallPurls(fakeArb, 'test-pkg'),
    ).resolves.toBeUndefined()
  })

  test('skips nodes missing name or version', async () => {
    const fakeArb = {
      idealTree: {
        inventory: {
          values: () => [
            { isProjectRoot: false, package: { name: undefined, version: '1.0.0' } },
            { isProjectRoot: false, package: { name: 'pkg', version: undefined } },
            { isProjectRoot: false, package: { name: undefined, version: undefined } },
          ],
        },
      },
    } as unknown as Parameters<typeof checkFirewallPurls>[0]
    // All nodes get filtered → purls empty → early return.
    await expect(
      checkFirewallPurls(fakeArb, 'test-pkg'),
    ).resolves.toBeUndefined()
  })
})
