/**
 * @file Unit tests for the reusable Socket state DB helpers.
 */

import os from 'node:os'
import path from 'node:path'

import { safeDeleteSync } from '../../../src/fs/safe.mjs'
import {
  closeSocketStateDb,
  ensureTable,
  openSocketStateDb,
} from '../../../src/state/db.mjs'
import { setPath } from '../../../src/paths/rewire.mjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const TEST_APP = 'socket-lib-test-db'

function testDbPath(): string {
  return path.join(
    os.tmpdir(),
    `socket-lib-state-db-${TEST_APP}-${process.pid}.sqlite`,
  )
}

describe('state/db', () => {
  let dbPath: string

  beforeEach(() => {
    dbPath = testDbPath()
    setPath('socket-state-dir', os.tmpdir())
  })

  afterEach(() => {
    safeDeleteSync(dbPath, { force: true })
    safeDeleteSync(`${dbPath}-wal`, { force: true })
    safeDeleteSync(`${dbPath}-shm`, { force: true })
  })

  it('opens a DB at the app path and enables WAL', () => {
    const db = openSocketStateDb(TEST_APP)
    const row = db
      .prepare('SELECT journal_mode FROM pragma_journal_mode')
      .get() as { journal_mode: string }
    expect(row.journal_mode).toBe('wal')
    closeSocketStateDb(db)
  })

  it('creates tables idempotently', () => {
    const db = openSocketStateDb(TEST_APP)
    ensureTable(db, 'items', 'id TEXT PRIMARY KEY, value TEXT NOT NULL')
    ensureTable(db, 'items', 'id TEXT PRIMARY KEY, value TEXT NOT NULL')
    db.prepare(
      "INSERT OR IGNORE INTO items (id, value) VALUES ('a', '1')",
    ).run()
    const row = db.prepare("SELECT value FROM items WHERE id = 'a'").get() as {
      value: string
    }
    expect(row.value).toBe('1')
    closeSocketStateDb(db)
  })
})
