// node --test specs for the shared fleet-roster reader.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  isOptedIn,
  isSquashOptIn,
  publishProfile,
  readRoster,
  resolveRepoName,
} from '../fleet-roster.mts'

const ROSTER = {
  repos: [
    { name: 'socket-btm', optIns: ['squash-history'] },
    { name: 'socket-lib' },
  ],
}

const LIB = '.claude/skills/fleet/cascading-fleet/lib'

test('isOptedIn matches a repo opt-in', () => {
  assert.equal(isOptedIn(ROSTER, 'socket-btm', 'squash-history'), true)
  assert.equal(isOptedIn(ROSTER, 'socket-lib', 'squash-history'), false)
  assert.equal(isOptedIn(ROSTER, 'unknown', 'squash-history'), false)
})

test('readRoster parses a roster file; undefined when missing', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'roster-'))
  try {
    const p = path.join(dir, 'fleet-repos.json')
    writeFileSync(p, JSON.stringify(ROSTER))
    assert.deepEqual(readRoster(p), ROSTER)
    assert.equal(readRoster(path.join(dir, 'nope.json')), undefined)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('resolveRepoName falls back to the working-tree basename', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'socket-btm-'))
  try {
    assert.equal(resolveRepoName(dir), path.basename(dir))
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('isSquashOptIn is true for an opted-in repo (live-tree roster + basename)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wt-'))
  const repoDir = path.join(dir, 'socket-btm')
  const rosterDir = path.join(repoDir, LIB)
  try {
    mkdirSync(rosterDir, { recursive: true })
    writeFileSync(path.join(rosterDir, 'fleet-repos.json'), JSON.stringify(ROSTER))
    assert.equal(isSquashOptIn(repoDir), true)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('isSquashOptIn is false for a non-opted repo', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wt2-'))
  const repoDir = path.join(dir, 'socket-lib')
  const rosterDir = path.join(repoDir, LIB)
  try {
    mkdirSync(rosterDir, { recursive: true })
    writeFileSync(path.join(rosterDir, 'fleet-repos.json'), JSON.stringify(ROSTER))
    assert.equal(isSquashOptIn(repoDir), false)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('publishProfile returns the repo profile, defaulting to none', () => {
  const roster = {
    repos: [
      { name: 'socket-lib', publishes: 'js' },
      { name: 'socket-addon', publishes: 'node' },
      { name: 'socket-cli' },
    ],
  }
  assert.equal(publishProfile(roster, 'socket-lib'), 'js')
  assert.equal(publishProfile(roster, 'socket-addon'), 'node')
  assert.equal(publishProfile(roster, 'socket-cli'), 'none')
  assert.equal(publishProfile(roster, 'absent-repo'), 'none')
})
