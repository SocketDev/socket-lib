/**
 * @file Unit tests for probeGitHubStatus(). Uses nock to mock
 *   githubstatus.com so tests are hermetic and don't hit the network.
 *
 *   Covers:
 *     - All operational → status: 'operational', degraded: false
 *     - One component degraded → status = that component's status
 *     - Multiple degraded → worst-case status
 *     - Unknown component IDs ignored (only monitored set)
 *     - Network failure → status: 'unknown', degraded: false (fails open)
 *     - 404 / non-JSON response → status: 'unknown'
 *     - Probe timeout → status: 'unknown'
 *     - summary string content
 *     - components array structure
 */

import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { probeGitHubStatus } from '../../../src/env/github-status'

const STATUS_HOST = 'https://www.githubstatus.com'
const STATUS_PATH = '/api/v2/components.json'

function makeComponents(overrides: Record<string, string> = {}) {
  return {
    components: [
      { id: 'br0l2tvcx85d', name: 'Actions', status: overrides['Actions'] ?? 'operational' },
      { id: '8l4ygp009s5s', name: 'Git Operations', status: overrides['Git Operations'] ?? 'operational' },
      { id: 'brv1bkgrwx7q', name: 'API Requests', status: overrides['API Requests'] ?? 'operational' },
      // Unmonitored component — should be ignored
      { id: 'kr09ddfgbfsf', name: 'Issues', status: 'partial_outage' },
    ],
  }
}

describe('probeGitHubStatus', () => {
  beforeEach(() => {
    nock.cleanAll()
    nock.disableNetConnect()
  })
  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  describe('all operational', () => {
    it('returns operational with degraded: false', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents())
      const result = await probeGitHubStatus()
      expect(result.status).toBe('operational')
      expect(result.degraded).toBe(false)
      expect(result.summary).toContain('operational')
    })

    it('ignores unmonitored components (Issues: partial_outage not flagged)', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents())
      const result = await probeGitHubStatus()
      expect(result.degraded).toBe(false)
      expect(result.components).toHaveLength(3)
      expect(result.components.every(c => c.status === 'operational')).toBe(true)
    })
  })

  describe('single component degraded', () => {
    it('Actions degraded → status: degraded_performance', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents({ 'Actions': 'degraded_performance' }))
      const result = await probeGitHubStatus()
      expect(result.status).toBe('degraded_performance')
      expect(result.degraded).toBe(true)
      expect(result.summary).toContain('Actions')
      expect(result.summary).toContain('degraded_performance')
    })

    it('Git Operations partial_outage → status: partial_outage', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents({ 'Git Operations': 'partial_outage' }))
      const result = await probeGitHubStatus()
      expect(result.status).toBe('partial_outage')
      expect(result.degraded).toBe(true)
    })

    it('API Requests major_outage → status: major_outage', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents({ 'API Requests': 'major_outage' }))
      const result = await probeGitHubStatus()
      expect(result.status).toBe('major_outage')
      expect(result.degraded).toBe(true)
    })

    it('under_maintenance counts as degraded', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents({ 'Actions': 'under_maintenance' }))
      const result = await probeGitHubStatus()
      expect(result.degraded).toBe(true)
    })
  })

  describe('multiple degraded — worst-case wins', () => {
    it('major_outage beats partial_outage', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents({
        'Actions': 'partial_outage',
        'Git Operations': 'major_outage',
        'API Requests': 'degraded_performance',
      }))
      const result = await probeGitHubStatus()
      expect(result.status).toBe('major_outage')
      expect(result.degraded).toBe(true)
      // summary mentions all three
      expect(result.summary).toContain('Actions')
      expect(result.summary).toContain('Git Operations')
      expect(result.summary).toContain('API Requests')
    })

    it('partial_outage beats degraded_performance', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents({
        'Actions': 'degraded_performance',
        'Git Operations': 'partial_outage',
      }))
      const result = await probeGitHubStatus()
      expect(result.status).toBe('partial_outage')
    })
  })

  describe('components array', () => {
    it('returns all three monitored components with name + status', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents())
      const result = await probeGitHubStatus()
      expect(result.components).toHaveLength(3)
      const names = result.components.map(c => c.name)
      expect(names).toContain('Actions')
      expect(names).toContain('Git Operations')
      expect(names).toContain('API Requests')
    })

    it('each component has id, name, status', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents())
      const result = await probeGitHubStatus()
      for (const c of result.components) {
        expect(typeof c.id).toBe('string')
        expect(typeof c.name).toBe('string')
        expect(typeof c.status).toBe('string')
      }
    })
  })

  describe('failure modes (fails open)', () => {
    it('network error → status: unknown, degraded: false', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).replyWithError('ECONNREFUSED')
      const result = await probeGitHubStatus()
      expect(result.status).toBe('unknown')
      expect(result.degraded).toBe(false)
      expect(result.components).toHaveLength(0)
    })

    it('404 response → status: unknown', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(404, 'Not Found')
      const result = await probeGitHubStatus()
      expect(result.status).toBe('unknown')
      expect(result.degraded).toBe(false)
    })

    it('non-JSON response body → status: unknown', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, 'this is not json')
      const result = await probeGitHubStatus()
      expect(result.status).toBe('unknown')
    })

    it('short timeout → status: unknown (fails open, not throwing)', async () => {
      // Simulate slow response by never replying
      nock(STATUS_HOST).get(STATUS_PATH).delay(10_000).reply(200, makeComponents())
      const result = await probeGitHubStatus(50) // 50ms timeout
      expect(result.status).toBe('unknown')
      expect(result.degraded).toBe(false)
    })

    it('summary mentions unreachable when unknown', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).replyWithError('timeout')
      const result = await probeGitHubStatus()
      expect(result.summary).toContain('unreachable')
    })
  })

  describe('summary content', () => {
    it('operational summary does not mention component names', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents())
      const result = await probeGitHubStatus()
      expect(result.summary).toContain('operational')
      // No individual component names in the all-good case
      expect(result.summary).not.toContain('Actions:')
    })

    it('degraded summary lists only degraded components', async () => {
      nock(STATUS_HOST).get(STATUS_PATH).reply(200, makeComponents({ 'Actions': 'degraded_performance' }))
      const result = await probeGitHubStatus()
      expect(result.summary).toContain('Actions')
      expect(result.summary).not.toContain('Git Operations')
      expect(result.summary).not.toContain('API Requests')
    })
  })
})
