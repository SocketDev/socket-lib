// node --test specs for the post-edit content materializer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  applyEditToFile,
  materializePostEditContent,
} from '../edit-content.mts'

function withTempFile(body: (filePath: string) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'editcontent-'))
  try {
    body(path.join(dir, 'file.txt'))
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

test('Write returns the full content as-is', () => {
  assert.equal(
    materializePostEditContent('/nope', 'FULL', { tool_name: 'Write' }),
    'FULL',
  )
})

test('applyEditToFile splices old → new against the on-disk file', () => {
  withTempFile(f => {
    writeFileSync(f, 'ABC')
    assert.equal(applyEditToFile(f, 'B', 'X'), 'AXC')
  })
})

test('applyEditToFile returns undefined on an ambiguous (repeated) match', () => {
  withTempFile(f => {
    writeFileSync(f, 'BB')
    assert.equal(applyEditToFile(f, 'B', 'X'), undefined)
  })
})

test('materialize Edit applies the diff to the WHOLE on-disk file', () => {
  withTempFile(f => {
    writeFileSync(f, 'import "x"\n\nhello world\n')
    const full = materializePostEditContent(f, undefined, {
      tool_name: 'Edit',
      tool_input: { old_string: 'hello world', new_string: 'hello there' },
    })
    // The import at the top survives — the materialized content is the whole
    // file, not just the new_string fragment.
    assert.match(full ?? '', /import "x"/)
    assert.match(full ?? '', /hello there/)
  })
})

test('materialize Edit falls back to new_string when the file is unreadable', () => {
  const full = materializePostEditContent('/nonexistent/file.txt', undefined, {
    tool_name: 'Edit',
    tool_input: { old_string: 'a', new_string: 'NEW' },
  })
  assert.equal(full, 'NEW')
})
