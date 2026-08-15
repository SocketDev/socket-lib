#!/usr/bin/env node
/*
 * @file Rename `dist/**\/*.d.mts` to `.d.ts` so every declaration pairs with
 *   the runtime file beside it.
 *
 *   The bundler emits `.js`, and TypeScript pairs `x.js` with `x.d.ts` — it
 *   does not look for `x.d.mts`. Since src moved to `.mts`, the declarations
 *   build started emitting `.d.mts`, so dist shipped mismatched pairs:
 *   `constants.js` beside `constants.d.mts`, with nothing linking them.
 *
 *   Consumers going through the exports map were fine (the map names both
 *   files explicitly), but a DEEP path import got no types at all. That is not
 *   hypothetical: three of this repo's own tests import `dist/...js` directly,
 *   on purpose, to catch ESM/CJS interop bugs that only appear after bundling,
 *   and they broke the moment the extension changed.
 *
 *   Runs BEFORE package-exports generation so the map is built from the final
 *   names.
 *
 *   Usage: node scripts/repo/post-build/pair-declarations-with-js.mts [--quiet]
 */

import { readdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'
import { isMainModule } from '../../fleet/_shared/is-main-module.mts'
import { runMain } from '../../fleet/_shared/run-main.mts'

import type { ScriptMeta } from '../../fleet/_shared/run-main.mts'

const logger = getDefaultLogger()

const DTS_MTS_SUFFIX = '.d.mts'

/**
 * Every `.d.mts` under `dir`, absolute, recursively.
 */
export function findDeclarationMts(dir: string): string[] {
  const found: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    // A dist that does not exist yet is not an error here; the build step
    // that creates it reports its own failure.
    return found
  }
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]!
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...findDeclarationMts(full))
    } else if (entry.name.endsWith(DTS_MTS_SUFFIX)) {
      found.push(full)
    }
  }
  return found
}

/**
 * The `.d.ts` name for a `.d.mts` path.
 */
export function pairedDeclarationPath(mtsPath: string): string {
  return `${mtsPath.slice(0, -DTS_MTS_SUFFIX.length)}.d.ts`
}

export function main(): void {
  const quiet = process.argv.includes('--quiet')
  const distDir = path.join(REPO_ROOT, 'dist')
  const found = findDeclarationMts(distDir)
  for (let i = 0, { length } = found; i < length; i += 1) {
    const from = found[i]!
    renameSync(from, pairedDeclarationPath(from))
  }
  if (!quiet) {
    logger.success(
      `post-build: paired ${found.length} declaration(s) with their .js runtime.`,
    )
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'renames dist .d.mts declarations to .d.ts so they pair with the emitted .js',
  help: `Usage: node scripts/repo/post-build/pair-declarations-with-js.mts [flags]

  --quiet  print nothing on success`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
