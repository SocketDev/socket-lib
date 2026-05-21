import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { checkFirewallPurls, npmPurl } from '../../../src/dlx/firewall'

vi.mock('../../../src/http-request/convenience', () => ({
  httpJson: vi.fn(),
}))

async function loadFresh() {
  const httpMod = await import('../../../src/http-request/convenience')
  const mod = await import('../../../src/dlx/firewall')
  return {
    httpJson: httpMod.httpJson as ReturnType<typeof vi.fn>,
    checkFirewallPurls: mod.checkFirewallPurls,
  }
}

function makeArb(
  packages: ReadonlyArray<{ name: string; version: string }>,
): Parameters<typeof checkFirewallPurls>[0] {
  return {
    idealTree: {
      inventory: {
        values: () =>
          packages.map(p => ({
            isProjectRoot: false,
            package: { name: p.name, version: p.version },
          })),
      },
    },
  } as unknown as Parameters<typeof checkFirewallPurls>[0]
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

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
            {
              isProjectRoot: true,
              package: { name: 'root', version: '1.0.0' },
            },
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
            {
              isProjectRoot: false,
              package: { name: undefined, version: '1.0.0' },
            },
            {
              isProjectRoot: false,
              package: { name: 'pkg', version: undefined },
            },
            {
              isProjectRoot: false,
              package: { name: undefined, version: undefined },
            },
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

describe.sequential('dlx/firewall — checkFirewallPurls HTTP path', () => {
  test('returns without throwing when the API reports no alerts', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson.mockResolvedValueOnce({ alerts: [] })
    const arb = makeArb([{ name: 'safe', version: '1.0.0' }])
    await expect(check(arb, 'safe')).resolves.toBeUndefined()
    expect(httpJson).toHaveBeenCalledTimes(1)
  })

  test('returns without throwing when alerts are below the block threshold', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson.mockResolvedValueOnce({
      alerts: [
        { severity: 'low', type: 'minor' },
        { severity: 'medium', type: 'moderate' },
        { severity: 'info', type: 'note' },
      ],
    })
    const arb = makeArb([{ name: 'noisy', version: '1.0.0' }])
    await expect(check(arb, 'noisy')).resolves.toBeUndefined()
  })

  test('throws when any dep has a critical-severity alert', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson.mockResolvedValueOnce({
      alerts: [{ severity: 'critical', type: 'malware' }],
    })
    const arb = makeArb([{ name: 'evil', version: '2.0.0' }])
    await expect(check(arb, 'top')).rejects.toThrow(
      /Socket Firewall blocked installation of "top"/,
    )
  })

  test('throws when any dep has a high-severity alert', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson.mockResolvedValueOnce({
      alerts: [{ severity: 'high', type: 'cve' }],
    })
    const arb = makeArb([{ name: 'risky', version: '1.0.0' }])
    await expect(check(arb, 'top')).rejects.toThrow(/risky@1\.0\.0/)
  })

  test('lists every blocked dep in the thrown message', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson
      .mockResolvedValueOnce({
        alerts: [{ severity: 'critical', type: 'malware' }],
      })
      .mockResolvedValueOnce({
        alerts: [{ severity: 'high', type: 'cve' }],
      })
    const arb = makeArb([
      { name: 'a', version: '1.0.0' },
      { name: 'b', version: '2.0.0' },
    ])
    await expect(check(arb, 'top')).rejects.toThrow(/a@1\.0\.0/)
    httpJson.mockClear()
    httpJson
      .mockResolvedValueOnce({
        alerts: [{ severity: 'critical', type: 'malware' }],
      })
      .mockResolvedValueOnce({
        alerts: [{ severity: 'high', type: 'cve' }],
      })
    await expect(check(arb, 'top')).rejects.toThrow(/b@2\.0\.0/)
  })

  test('falls back to alert.key then "unknown" when type is missing', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson.mockResolvedValueOnce({
      alerts: [
        { severity: 'critical', key: 'fallback-key' },
        { severity: 'high' },
      ],
    })
    const arb = makeArb([{ name: 'mixed', version: '1.0.0' }])
    await expect(check(arb, 'top')).rejects.toThrow(/fallback-key/)
    httpJson.mockClear()
    httpJson.mockResolvedValueOnce({
      alerts: [{ severity: 'high' }],
    })
    await expect(check(arb, 'top')).rejects.toThrow(/unknown/)
  })

  test('treats httpJson errors as non-fatal (allows install to proceed)', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson.mockRejectedValueOnce(new Error('network down'))
    const arb = makeArb([{ name: 'pkg', version: '1.0.0' }])
    await expect(check(arb, 'pkg')).resolves.toBeUndefined()
  })

  test('treats a malformed response (alerts undefined) as no alerts', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson.mockResolvedValueOnce({})
    const arb = makeArb([{ name: 'pkg', version: '1.0.0' }])
    await expect(check(arb, 'pkg')).resolves.toBeUndefined()
  })

  test('ignores alerts with no severity field', async () => {
    const { checkFirewallPurls: check, httpJson } = await loadFresh()
    httpJson.mockResolvedValueOnce({
      alerts: [{ type: 'orphan' }, { severity: 'critical', type: 'real' }],
    })
    const arb = makeArb([{ name: 'pkg', version: '1.0.0' }])
    await expect(check(arb, 'pkg')).rejects.toThrow(/real/)
  })
})
