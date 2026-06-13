// vitest specs for the researching-recency renderer + CLI arg parsing. Asserts
// the compact output carries the exact contract markers (badge, evidence
// envelope, pass-through footer) and that parseArgs reads both --flag=value and
// --flag value forms.

import assert from 'node:assert/strict'

import { test } from 'vitest'

import { parseArgs } from '../../../scripts/fleet/researching-recency/cli.mts'
import {
  BADGE_PREFIX,
  EVIDENCE_CLOSE,
  EVIDENCE_OPEN,
  FOOTER_CLOSE,
  FOOTER_HEADLINE,
  FOOTER_OPEN,
} from '../../../scripts/fleet/researching-recency/lib/markers.mts'
import {
  renderBadge,
  renderCompact,
} from '../../../scripts/fleet/researching-recency/lib/render/compact.mts'
import { renderFooter } from '../../../scripts/fleet/researching-recency/lib/render/footer.mts'

import type {
  Candidate,
  SourceResult,
} from '../../../scripts/fleet/researching-recency/lib/types.mts'

function makeCandidate(over: Partial<Candidate>): Candidate {
  return {
    candidateId: 'k',
    itemId: '1',
    source: 'hackernews',
    title: 'Rolldown is fast',
    url: 'https://rolldown.rs',
    snippet: 'a fast bundler',
    subqueryLabels: ['main'],
    nativeRanks: {},
    localRelevance: 0.8,
    freshness: 90,
    engagement: 50,
    sourceQuality: 0.8,
    rrfScore: 0.0164,
    sources: ['hackernews'],
    sourceItems: [
      {
        itemId: '1',
        source: 'hackernews',
        title: 'Rolldown is fast',
        body: '',
        url: 'https://rolldown.rs',
        container: 'Hacker News',
        publishedAt: '2026-06-06T00:00:00Z',
        engagement: { points: 186, comments: 122 },
        snippet: 'a fast bundler',
        metadata: {},
      },
    ],
    ...over,
  }
}

// ── renderBadge ─────────────────────────────────────────────────

test('renderBadge is the first-line badge with the synced date', () => {
  const badge = renderBadge('2026-06-07')
  assert.ok(badge.startsWith(BADGE_PREFIX))
  assert.ok(badge.includes('synced 2026-06-07'))
})

// ── renderFooter ────────────────────────────────────────────────

test('renderFooter bounds the per-source lines with the footer markers', () => {
  const results: SourceResult[] = [
    { source: 'hackernews', status: 'ok', items: [makeCandidate({}).sourceItems[0]!] },
    { source: 'bluesky', status: 'skipped', items: [], note: 'set BSKY_HANDLE' },
  ]
  const footer = renderFooter(results, '/tmp/x-raw.md')
  assert.ok(footer.startsWith(FOOTER_OPEN))
  assert.ok(footer.includes(FOOTER_HEADLINE))
  assert.ok(footer.includes('hackernews: 1 item'))
  assert.ok(footer.includes('bluesky: 0 items (set BSKY_HANDLE)'))
  assert.ok(footer.includes('Saved: /tmp/x-raw.md'))
  assert.ok(footer.trimEnd().endsWith(FOOTER_CLOSE))
})

// ── renderCompact ───────────────────────────────────────────────

test('renderCompact emits badge, evidence envelope, and footer in order', () => {
  const output = renderCompact({
    candidates: [makeCandidate({})],
    results: [
      { source: 'hackernews', status: 'ok', items: [makeCandidate({}).sourceItems[0]!] },
    ],
    topic: 'rolldown',
    syncedDate: '2026-06-07',
    fromDate: '2026-05-08',
    savedPath: '/tmp/rolldown-raw.md',
  })
  // First line is the badge.
  assert.ok(output.split('\n')[0]!.startsWith(BADGE_PREFIX))
  // Envelope wraps the ranked clusters.
  assert.ok(output.includes(EVIDENCE_OPEN))
  assert.ok(output.includes('## Ranked Evidence Clusters'))
  assert.ok(output.includes('[Rolldown is fast](https://rolldown.rs)'))
  assert.ok(output.includes('186 points'))
  assert.ok(output.includes(EVIDENCE_CLOSE))
  // Footer is present and ordered after the envelope.
  assert.ok(output.indexOf(FOOTER_OPEN) > output.indexOf(EVIDENCE_CLOSE))
})

// ── parseArgs ───────────────────────────────────────────────────

test('parseArgs reads the topic positional and --flag=value form', () => {
  const args = parseArgs(['rolldown', '--emit=compact', '--days=14', '--depth=deep'])
  assert.equal(args.topic, 'rolldown')
  assert.equal(args.emit, 'compact')
  assert.equal(args.days, 14)
  assert.equal(args.depth, 'deep')
})

test('parseArgs reads the --flag value (space-separated) form', () => {
  const args = parseArgs(['rolldown', '--save-dir', '/tmp/out', '--web-file', '/tmp/web.json'])
  assert.equal(args.saveDir, '/tmp/out')
  assert.equal(args.webFile, '/tmp/web.json')
})

test('parseArgs splits --search into a source list', () => {
  const args = parseArgs(['rolldown', '--search=github,hackernews,reddit'])
  assert.deepEqual(args.search, ['github', 'hackernews', 'reddit'])
})
