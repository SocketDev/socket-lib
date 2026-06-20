// node --test specs for the isFleetTarget detector.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  actedOnPath,
  isFleetRepoRoot,
  isFleetTarget,
} from '../fleet-context.mts'

test('actedOnPath: Edit/Write resolves the file directory', () => {
  assert.equal(
    actedOnPath({ tool_name: 'Write', tool_input: { file_path: '/a/b/c.md' } }),
    '/a/b',
  )
})

test('actedOnPath: Bash resolves the command cwd', () => {
  assert.equal(actedOnPath({ tool_name: 'Bash', cwd: '/work/dir' }), '/work/dir')
})

test('isFleetRepoRoot: an external review-clone path is non-fleet', () => {
  assert.equal(
    isFleetRepoRoot('/tmp/.socket/_wheelhouse/repo-clones/org-repo'),
    false,
  )
})

test('isFleetRepoRoot: fleet structure (hooks/fleet + canonical marker) → true', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fleetctx-'))
  try {
    mkdirSync(path.join(dir, '.claude', 'hooks', 'fleet'), { recursive: true })
    writeFileSync(
      path.join(dir, 'CLAUDE.md'),
      '# Repo\n\n<!-- BEGIN <fleet-canonical> -->\n\n## x\n',
    )
    assert.equal(isFleetRepoRoot(dir), true)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('isFleetRepoRoot: a plain repo without fleet markers is non-fleet', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fleetctx2-'))
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# Just a readme\n')
    assert.equal(isFleetRepoRoot(dir), false)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('isFleetTarget: a non-git path fails SAFE to fleet=true', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fleetctx3-'))
  try {
    assert.equal(isFleetTarget({ tool_name: 'Bash', cwd: dir }), true)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})
