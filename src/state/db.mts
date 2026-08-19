/**
 * @file Reusable SQLite helpers for the Socket `_state` database. Built on
 *   `node:sqlite` (Node 22+), WAL mode, owner-only permissions. Apps own their
 *   schema and queries; this module only opens, closes, and creates tables.
 */

import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { safeMkdirSync } from '../fs/safe.mjs'
import { getSocketStateDbPath } from '../paths/socket.mjs'

export function closeSocketStateDb(db: DatabaseSync): void {
  db.close()
}

export function ensureTable(
  db: DatabaseSync,
  name: string,
  columns: string,
): void {
  db.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(name)} (${columns})`)
}

export function openSocketStateDb(appName: string): DatabaseSync {
  const dbPath = getSocketStateDbPath(appName)
  safeMkdirSync(path.dirname(dbPath))
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  return db
}

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}
