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
 *   Renaming the file is only half the job. tsgo emits a `.mts` source's
 *   re-exports with `.mjs` specifiers (`export { x } from './leaf.mjs'`),
 *   which is right for a `.d.mts` and wrong the instant the file becomes a
 *   `.d.ts`. TypeScript resolves a `.mjs` specifier ONLY to `.mts`/`.d.mts`,
 *   and the pack ships neither, so every such re-export dangles and each
 *   symbol behind it silently degrades to `any` - no consumer error, just
 *   lost types. That shipped in 7.0.0: 322 declarations, 517 dead specifiers,
 *   ~260 symbols across 24 public subpaths. So rewrite the specifiers to
 *   `.js` as part of the rename, matching what rolldown emits beside them.
 *
 *   Runs BEFORE package-exports generation so the map is built from the final
 *   names.
 *
 *   Usage: node scripts/repo/post-build/pair-declarations-with-js.mts [--quiet]
 */

import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'
import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { runMain } from '../../fleet/process/run-main.mts'

import type { ScriptMeta } from '../../fleet/process/run-main.mts'

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

/**
 * Point a declaration's relative `.mjs` specifiers at `.js`.
 *
 * Comment lines are skipped so a JSDoc `@example` that shows a `.mjs` import
 * keeps reading the way the author wrote it. Only `from '...'` and
 * `import('...')` in real statement positions move, and only when the
 * specifier is relative - a bare package specifier is that package's business.
 */
export function rewriteDeclarationSpecifiers(source: string): string {
  // Walk line by line without splitting: `m` stops `.` at the newline, so a
  // CRLF file's trailing \r rides along inside the match and is written back
  // untouched. Splitting and rejoining would silently retype the line endings.
  return source.replace(/^.*$/gm, line => {
    const trimmed = line.trimStart()
    if (
      trimmed.startsWith('*') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*')
    ) {
      return line
    }
    return (
      line
        // `from '<relative>.mjs'` -> `from '<relative>.js'`.
        // 1. (\bfrom\s*') the keyword and the opening quote
        // 2. (\.[^']*) the specifier body, which MUST start with a dot so a
        //    bare package specifier stays that package's business
        // 3. \.mjs(') the extension to swap and the closing quote
        .replace(/(\bfrom\s*')(\.[^']*)\.mjs(')/g, '$1$2.js$3')
        // The same swap for a type-position `import('<relative>.mjs')`.
        // 1. (\bimport\s*\(\s*') the keyword, paren and opening quote
        // 2. (\.[^']*) the dot-anchored specifier body
        // 3. \.mjs('\s*\)) the extension, closing quote and paren
        .replace(/(\bimport\s*\(\s*')(\.[^']*)\.mjs('\s*\))/g, '$1$2.js$3')
    )
  })
}

export function main(): void {
  const quiet = process.argv.includes('--quiet')
  const distDir = path.join(REPO_ROOT, 'dist')
  const found = findDeclarationMts(distDir)
  let rewritten = 0
  for (let i = 0, { length } = found; i < length; i += 1) {
    const from = found[i]!
    const source = readFileSync(from, 'utf8')
    const next = rewriteDeclarationSpecifiers(source)
    if (next !== source) {
      writeFileSync(from, next)
      rewritten += 1
    }
    renameSync(from, pairedDeclarationPath(from))
  }
  if (!quiet) {
    logger.success(
      `post-build: paired ${found.length} declaration(s) with their .js runtime, ${rewritten} respecified.`,
    )
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'renames dist .d.mts declarations to .d.ts and repoints their .mjs specifiers at .js',
  help: `Usage: node scripts/repo/post-build/pair-declarations-with-js.mts [flags]

  --quiet  print nothing on success`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
