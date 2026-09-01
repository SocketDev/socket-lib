/*
 * @file The one reader for the `buildStubs` section of
 *   `.config/repo/socket-wheelhouse.json`.
 *
 *   Both leaf lists moved here from loose JSON beside the scripts. Two files
 *   for one concern is the fragmentation the member settings file exists to
 *   prevent, and a single reader keeps the audit, the post-build pass, and the
 *   checks agreeing on where the data lives.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A leaf held out of the stub list, with the consumer it waits for.
 */
export interface KeptLeaf {
  leaf: string
  reason: string
}

/**
 * The stub list plus the roster it was judged against.
 */
export interface UnexposedRecord {
  leaves: string[]
  scannedRoster: string[]
}

/**
 * The member settings file holding the section.
 */
export function memberSettingsPath(repoRoot: string): string {
  return path.join(repoRoot, '.config', 'repo', 'socket-wheelhouse.json')
}

/**
 * The whole `buildStubs` section, or an empty one when the file or section is
 * absent. Absent means "nothing declared", never an error: a repo that
 * publishes no per-leaf surface simply has no section.
 */
export function readBuildStubs(repoRoot: string): {
  keepExposed: KeptLeaf[]
  unexposed: UnexposedRecord
} {
  const empty = {
    keepExposed: [] as KeptLeaf[],
    unexposed: { leaves: [], scannedRoster: [] } as UnexposedRecord,
  }
  const settingsPath = memberSettingsPath(repoRoot)
  if (!existsSync(settingsPath)) {
    return empty
  }
  const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
    buildStubs?:
      | {
          keepExposed?: KeptLeaf[] | undefined
          unexposed?: UnexposedRecord | undefined
        }
      | undefined
  }
  const section = parsed.buildStubs
  if (!section) {
    return empty
  }
  return {
    keepExposed: section.keepExposed ?? [],
    unexposed: section.unexposed ?? { leaves: [], scannedRoster: [] },
  }
}

/**
 * The leaves published with a real implementation ahead of their first fleet
 * consumer. The stub list is consumer-driven, so without this a primitive
 * shipped for the fleet to adopt is stubbed on its first release, and a stub
 * cannot acquire the consumer that would un-stub it.
 */
export function keptLeafEntries(repoRoot: string): KeptLeaf[] {
  return readBuildStubs(repoRoot).keepExposed
}

/**
 * Add kept-leaf entries, leaving every other key untouched.
 *
 * Exposure survives only when recorded HERE. Dropping a leaf from
 * `unexposed.leaves` alone lasts until the next `--write-stub-list`, which
 * recomputes that list from fleet consumers and re-adds anything no repo
 * imports by specifier. Existing entries win, so a hand-written reason is never
 * replaced by a generated one.
 */
export function addKeptLeaves(
  repoRoot: string,
  entries: readonly KeptLeaf[],
  writeFileSync: (p: string, data: string) => void,
): void {
  const settingsPath = memberSettingsPath(repoRoot)
  const parsed = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<
        string,
        unknown
      >)
    : {}
  const buildStubs = parsed['buildStubs'] as
    | { keepExposed?: KeptLeaf[] | undefined }
    | undefined
  const byLeaf = new Map<string, KeptLeaf>()
  for (const entry of buildStubs?.keepExposed ?? []) {
    byLeaf.set(entry.leaf, entry)
  }
  for (const entry of entries) {
    if (!byLeaf.has(entry.leaf)) {
      byLeaf.set(entry.leaf, entry)
    }
  }
  const keepExposed = [...byLeaf.values()].toSorted((a, b) =>
    a.leaf < b.leaf ? -1 : a.leaf > b.leaf ? 1 : 0,
  )
  const section = {
    ...(parsed['buildStubs'] as Record<string, unknown> | undefined),
    keepExposed,
  }
  writeFileSync(
    settingsPath,
    `${JSON.stringify({ ...parsed, buildStubs: section }, null, 2)}\n`,
  )
}

/**
 * Replace `buildStubs.unexposed` in the member settings file, leaving every
 * other key exactly as it was.
 *
 * Read-modify-write, never a whole-document write. The settings file is a
 * HYBRID surface: the fleet cascade owns most of it and the member owns its
 * `<repo>` cutouts, so a writer that serializes only the section it cares
 * about silently deletes everyone else's. That is not hypothetical - a
 * whole-document write here once reduced the file from seventeen top-level
 * keys to two, taking `bundle.ref` with it, and every CI run then failed at
 * the payload fetch because the fleet-pack pin was gone.
 */
export function writeUnexposedLeaves(
  repoRoot: string,
  record: UnexposedRecord,
  writeFileSync: (p: string, data: string) => void,
): void {
  const settingsPath = memberSettingsPath(repoRoot)
  const parsed = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<
        string,
        unknown
      >)
    : {}
  const section = {
    ...(parsed['buildStubs'] as Record<string, unknown> | undefined),
    unexposed: record,
  }
  writeFileSync(
    settingsPath,
    `${JSON.stringify({ ...parsed, buildStubs: section }, null, 2)}\n`,
  )
}
