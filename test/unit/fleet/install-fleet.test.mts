// Tests for the pure helpers exported by scripts/fleet/install-fleet.mts.
// Network and file-system I/O (gh, tar, copyFileSync) are not exercised here —
// those surfaces require live credentials. The splice, sha, and verification
// logic carry the real correctness burden.

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

import { test } from 'vitest'

import {
  beginMarker,
  computeSha256,
  endMarker,
  mergeWorkspaceYaml,
  PREPARE_FETCH,
  readBundleRef,
  SYNC_FLEET_SCRIPT,
  spliceFleetBlock,
  thinIgnoreEntries,
  verifyBundleFiles,
  wirePackageJson,
  verifySegments,
} from '../../../scripts/fleet/install-fleet.mts'
import type {
  BundleManifest,
  FleetCommentStyle,
  MergeWorkspaceOptions,
} from '../../../scripts/fleet/install-fleet.mts'

// ── computeSha256 ─────────────────────────────────────────────────────────────

test('computeSha256 produces a 64-char hex string for non-empty input', () => {
  const digest = computeSha256(Buffer.from('hello'))
  assert.equal(typeof digest, 'string')
  assert.equal(digest.length, 64)
  assert.match(digest, /^[0-9a-f]{64}$/)
})

test('computeSha256 is deterministic', () => {
  const a = computeSha256(Buffer.from('socket'))
  const b = computeSha256(Buffer.from('socket'))
  assert.equal(a, b)
})

test('computeSha256 differs for different inputs', () => {
  assert.notEqual(
    computeSha256(Buffer.from('a')),
    computeSha256(Buffer.from('b')),
  )
})

// ── beginMarker / endMarker ───────────────────────────────────────────────────

test('beginMarker html matches fleet-markers grammar', () => {
  assert.equal(beginMarker('html'), '<!-- BEGIN <fleet-canonical> -->')
})

test('endMarker html matches fleet-markers grammar', () => {
  assert.equal(endMarker('html'), '<!-- END </fleet-canonical> -->')
})

test('beginMarker hash matches fleet-markers grammar', () => {
  assert.equal(beginMarker('hash'), '# BEGIN <fleet-canonical>')
})

test('endMarker hash matches fleet-markers grammar', () => {
  assert.equal(endMarker('hash'), '# END </fleet-canonical>')
})

test('beginMarker slash matches fleet-markers grammar', () => {
  assert.equal(beginMarker('slash'), '// BEGIN <fleet-canonical>')
})

// ── spliceFleetBlock — existing html markers ───────────────────────────────────

const HTML_BEGIN = beginMarker('html')
const HTML_END = endMarker('html')

const FLEET_BLOCK_HTML = [HTML_BEGIN, '## Fleet', '- rule A', HTML_END].join(
  '\n',
)

test('spliceFleetBlock html: replaces existing block byte-exactly', () => {
  const original = [
    '# CLAUDE.md',
    '',
    HTML_BEGIN,
    '## Fleet',
    '- old rule',
    HTML_END,
    '',
    '## Project',
    '- custom content',
  ].join('\n')

  const result = spliceFleetBlock({
    commentStyle: 'html',
    fleetBlock: FLEET_BLOCK_HTML,
    target: original,
  })

  const lines = result.split('\n')
  assert.equal(lines[0], '# CLAUDE.md')
  assert.ok(result.includes('- rule A'), 'new fleet rule present')
  assert.ok(!result.includes('- old rule'), 'old fleet rule removed')
  assert.ok(result.includes('## Project'), 'project content preserved')
})

test('spliceFleetBlock html: markers are inclusive in replacement', () => {
  const original = ['# Title', HTML_BEGIN, '- stale', HTML_END, 'after'].join(
    '\n',
  )
  const result = spliceFleetBlock({
    commentStyle: 'html',
    fleetBlock: FLEET_BLOCK_HTML,
    target: original,
  })
  assert.ok(result.startsWith('# Title\n'))
  assert.ok(result.includes(HTML_BEGIN))
  assert.ok(result.includes(HTML_END))
  assert.ok(!result.includes('- stale'))
  assert.ok(result.includes('after'))
})

// ── spliceFleetBlock — insert-when-absent (html) ───────────────────────────────

test('spliceFleetBlock html: inserts before first H2 when no markers', () => {
  const original = ['# My Repo CLAUDE.md', '', '## Setup', '- step 1'].join(
    '\n',
  )
  const result = spliceFleetBlock({
    commentStyle: 'html',
    fleetBlock: FLEET_BLOCK_HTML,
    target: original,
  })
  const lines = result.split('\n')
  const fleetBeginIdx = lines.findIndex(l => l === HTML_BEGIN)
  const h2Idx = lines.findIndex(l => l === '## Setup')
  assert.ok(fleetBeginIdx !== -1, 'fleet block inserted')
  assert.ok(fleetBeginIdx < h2Idx, 'fleet block before ## Setup')
  assert.ok(result.includes('# My Repo CLAUDE.md'))
  assert.ok(result.includes('## Setup'))
})

test('spliceFleetBlock html: appends at end when no H2 and no markers', () => {
  const original = '# Title\n\nSome prose.'
  const result = spliceFleetBlock({
    commentStyle: 'html',
    fleetBlock: FLEET_BLOCK_HTML,
    target: original,
  })
  assert.ok(result.startsWith('# Title\n'))
  assert.ok(result.includes(HTML_BEGIN))
  assert.ok(result.endsWith(HTML_END + '\n') || result.includes(HTML_END))
})

// ── spliceFleetBlock — hash style (.gitignore) ────────────────────────────────

const HASH_BEGIN = beginMarker('hash')
const HASH_END = endMarker('hash')

const FLEET_BLOCK_HASH = [HASH_BEGIN, 'node_modules/', HASH_END].join('\n')

test('spliceFleetBlock hash: replaces existing block', () => {
  const original = [
    '# My ignores',
    HASH_BEGIN,
    'old-entry/',
    HASH_END,
    'dist/',
  ].join('\n')
  const result = spliceFleetBlock({
    commentStyle: 'hash',
    fleetBlock: FLEET_BLOCK_HASH,
    target: original,
  })
  assert.ok(result.includes('# My ignores'))
  assert.ok(result.includes('node_modules/'))
  assert.ok(!result.includes('old-entry/'))
  assert.ok(result.includes('dist/'))
})

test('spliceFleetBlock hash: appends with blank line when no markers', () => {
  const original = '# project ignores\ndist/'
  const result = spliceFleetBlock({
    commentStyle: 'hash',
    fleetBlock: FLEET_BLOCK_HASH,
    target: original,
  })
  assert.ok(result.startsWith('# project ignores\ndist/'))
  assert.ok(result.includes('\n\n' + HASH_BEGIN))
  assert.ok(result.includes('node_modules/'))
})

// ── verifyBundleFiles ─────────────────────────────────────────────────────────

test('verifyBundleFiles: passes when all files present and match', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-verify-'))
  try {
    const content = Buffer.from('hello world')
    fs.writeFileSync(path.join(tmp, 'file.txt'), content)
    const manifest: BundleManifest = {
      files: { 'file.txt': computeSha256(content) },
      templateSha: 'abc',
      version: '1.0',
    }
    const problems = verifyBundleFiles(tmp, manifest)
    assert.deepEqual(problems, [])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('verifyBundleFiles: reports missing file', () => {
  const manifest: BundleManifest = {
    files: { 'missing.txt': 'deadbeef' },
    templateSha: 'abc',
    version: '1.0',
  }
  const problems = verifyBundleFiles('/nonexistent-dir', manifest)
  assert.ok(problems.some(p => p.includes('missing')))
})

test('verifyBundleFiles: reports sha256 mismatch', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-mismatch-'))
  try {
    fs.writeFileSync(path.join(tmp, 'f.txt'), 'actual content')
    const manifest: BundleManifest = {
      files: { 'f.txt': 'wronghash' },
      templateSha: 'abc',
      version: '1.0',
    }
    const problems = verifyBundleFiles(tmp, manifest)
    assert.ok(problems.some(p => p.includes('mismatch')))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

// ── verifySegments ────────────────────────────────────────────────────────────

test('verifySegments: empty when manifest has no segments', () => {
  const manifest: BundleManifest = {
    files: {},
    templateSha: 'abc',
    version: '1.0',
  }
  const problems = verifySegments('/unused', manifest)
  assert.deepEqual(problems, [])
})

test('verifySegments: reports missing segment file', () => {
  const manifest: BundleManifest = {
    files: {},
    segments: [{ commentStyle: 'html', path: 'CLAUDE.md', sha256: 'abc' }],
    templateSha: 'abc',
    version: '1.0',
  }
  const problems = verifySegments('/nonexistent-dir', manifest)
  assert.ok(problems.some(p => p.includes('missing')))
})

test('verifySegments: passes when segment matches', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-seg-'))
  try {
    const block = Buffer.from(
      '<!-- BEGIN <fleet-canonical> -->\n## Fleet\n<!-- END </fleet-canonical> -->',
    )
    fs.writeFileSync(path.join(tmp, 'CLAUDE.md.fleetblock'), block)
    const manifest: BundleManifest = {
      files: {},
      segments: [
        {
          commentStyle: 'html',
          path: 'CLAUDE.md',
          sha256: computeSha256(block),
        },
      ],
      templateSha: 'abc',
      version: '1.0',
    }
    const problems = verifySegments(tmp, manifest)
    assert.deepEqual(problems, [])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

// ── mergeWorkspaceYaml ────────────────────────────────────────────────────────

test('mergeWorkspaceYaml: fleet scalar replaced + packages: preserved byte-exact', () => {
  const consumerYaml = [
    'packages:',
    '  - packages/*',
    'minimumReleaseAge: 5000',
  ].join('\n')

  const bundleFleetSections = 'minimumReleaseAge: 10080\n'

  const options: MergeWorkspaceOptions = {
    bundleFleetSections,
    consumerYaml,
    fleetKeys: ['minimumReleaseAge'],
  }
  const result = mergeWorkspaceYaml(options)

  assert.ok(result.includes('10080'), 'fleet scalar replaced with bundle value')
  assert.ok(!result.includes('5000'), 'old value removed')
  assert.ok(result.includes('packages:'), 'packages: key preserved')
  assert.ok(
    result.includes('  - packages/*'),
    'packages: content preserved byte-exact',
  )
})

test('mergeWorkspaceYaml: fleet catalog/overrides block replaced', () => {
  const consumerYaml = [
    'packages:',
    '  - packages/*',
    'overrides:',
    '  old-pkg: 1.0.0',
    '  another: 2.0.0',
  ].join('\n')

  const bundleFleetSections = [
    'overrides:',
    '  new-pkg: 3.0.0',
    '  updated: 4.0.0',
  ].join('\n')

  const options: MergeWorkspaceOptions = {
    bundleFleetSections,
    consumerYaml,
    fleetKeys: ['overrides'],
  }
  const result = mergeWorkspaceYaml(options)

  assert.ok(result.includes('new-pkg: 3.0.0'), 'new overrides present')
  assert.ok(result.includes('updated: 4.0.0'), 'new overrides present')
  assert.ok(!result.includes('old-pkg'), 'old overrides removed')
  assert.ok(!result.includes('another'), 'old overrides removed')
  assert.ok(result.includes('packages:'), 'packages: preserved')
})

test('mergeWorkspaceYaml: throws on ambiguous input (duplicate fleet key)', () => {
  const consumerYaml = [
    'packages:',
    '  - packages/*',
    'minimumReleaseAge: 5000',
    'minimumReleaseAge: 9000',
  ].join('\n')

  const bundleFleetSections = 'minimumReleaseAge: 10080\n'

  const options: MergeWorkspaceOptions = {
    bundleFleetSections,
    consumerYaml,
    fleetKeys: ['minimumReleaseAge'],
  }
  assert.throws(
    () => mergeWorkspaceYaml(options),
    (err: unknown) => {
      assert.ok(err instanceof Error)
      assert.ok(
        err.message.includes('minimumReleaseAge'),
        'error names the duplicate key',
      )
      return true
    },
  )
})

// ── thinIgnoreEntries — wholly-fleet untrack set, never a repo sibling ───────

test('thinIgnoreEntries collapses fleet tiers, lists mixed-dir + root files exactly', () => {
  const manifest = {
    files: {
      '.claude/hooks/fleet/a/index.mts': 'x',
      '.claude/hooks/fleet/b/index.mts': 'x',
      '.config/fleet/oxlintrc.json': 'x',
      'docs/agents.md/fleet/topic.md': 'x',
      'scripts/fleet/install-fleet.mts': 'x',
      '.github/workflows/provenance.yml': 'x',
      '.npmrc': 'x',
      'CLAUDE.md': 'x',
    },
    segments: [{ path: 'CLAUDE.md' }],
  }
  const entries = thinIgnoreEntries(manifest)
  // Fleet tiers collapse to a single root.
  assert.ok(entries.includes('.claude/hooks/fleet/'))
  assert.ok(entries.includes('.config/fleet/'))
  assert.ok(entries.includes('docs/agents.md/fleet/'))
  assert.ok(entries.includes('scripts/fleet/'))
  // Mixed dir + root file listed EXACTLY (the member's own ci.yml / config stay).
  assert.ok(entries.includes('.github/workflows/provenance.yml'))
  assert.ok(entries.includes('.npmrc'))
  // Hybrid file (a segment) is NOT untracked.
  assert.ok(!entries.includes('CLAUDE.md'))
})

test('thinIgnoreEntries never emits a bare mixed-dir root (no over-untrack)', () => {
  const manifest = {
    files: {
      '.claude/hooks/fleet/a/index.mts': 'x',
      '.github/workflows/provenance.yml': 'x',
    },
    segments: [],
  }
  const entries = thinIgnoreEntries(manifest)
  // These would untrack member CI + repo-owned hooks — must NEVER appear.
  assert.ok(!entries.includes('.github/workflows/'))
  assert.ok(!entries.includes('.claude/hooks/'))
  assert.ok(!entries.includes('.claude/'))
})

// ── readBundleRef — ref pinned in the wheelhouse settings file ───────────────

test('readBundleRef reads bundle.ref from .config/socket-wheelhouse.json', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-ref-'))
  try {
    fs.mkdirSync(path.join(tmp, '.config'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, '.config/socket-wheelhouse.json'),
      JSON.stringify({ bundle: { ref: 'fleet-abc123' } }),
    )
    assert.equal(readBundleRef(tmp), 'fleet-abc123')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('readBundleRef returns undefined when the file or field is absent', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-noref-'))
  try {
    assert.equal(readBundleRef(tmp), undefined)
    fs.mkdirSync(path.join(tmp, '.config'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, '.config/socket-wheelhouse.json'),
      JSON.stringify({ repo: { type: 'solo' } }),
    )
    assert.equal(readBundleRef(tmp), undefined)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

// ── wirePackageJson — the prepare BELT (fetch before install-git-hooks) ──────

function wireTmp(prepare?: string): {
  dir: string
  read: () => { scripts?: Record<string, string> }
} {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-wire-'))
  const scripts = prepare ? { prepare } : {}
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'm', scripts }),
  )
  return {
    dir,
    read: () =>
      JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')),
  }
}

test('wirePackageJson prepends the fetch belt BEFORE install-git-hooks', () => {
  const { dir, read } = wireTmp('node scripts/fleet/install-git-hooks.mts')
  wirePackageJson(dir)
  const { scripts } = read()
  assert.equal(scripts!['sync-fleet'], SYNC_FLEET_SCRIPT)
  assert.equal(
    scripts!['prepare'],
    `${PREPARE_FETCH} && node scripts/fleet/install-git-hooks.mts`,
  )
})

test('wirePackageJson sets prepare to the fetch when none exists', () => {
  const { dir, read } = wireTmp()
  wirePackageJson(dir)
  assert.equal(read().scripts!['prepare'], PREPARE_FETCH)
})

test('wirePackageJson is idempotent on an already-belted prepare', () => {
  const { dir, read } = wireTmp(
    `${PREPARE_FETCH} && node scripts/fleet/install-git-hooks.mts`,
  )
  wirePackageJson(dir)
  // No double-prepend.
  assert.equal(
    read().scripts!['prepare'],
    `${PREPARE_FETCH} && node scripts/fleet/install-git-hooks.mts`,
  )
})
