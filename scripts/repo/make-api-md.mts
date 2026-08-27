/**
 * @file Generate docs/api.md and the published llms.txt from package.json
 *   exports. Walks every subpath export, finds the matching source file under
 *   src/, and emits (1) a grouped markdown table for humans (docs/api.md,
 *   linking to src/) and (2) a publish-safe llms.txt discovery index for AI
 *   agents (linking to the shipped .d.mts declarations). Regenerate whenever
 *   exports change.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { isWin32 } from '@socketsecurity/lib-stable/constants/platform'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'

// Repo root from the canonical paths module (1 path, 1 reference) — not a
// hand-walked `__dirname/../..`, which silently breaks when the file moves.
import { REPO_ROOT as rootPath } from '../fleet/paths.mts'

import { isMainModule } from '../fleet/_shared/is-main-module.mts'
import { runMain } from '../fleet/_shared/run-main.mts'

import type { ScriptMeta } from '../fleet/_shared/run-main.mts'

const logger = getDefaultLogger()

type PackageExports = Record<
  string,
  | string
  | { types?: string | undefined; default?: string | undefined }
  | undefined
>

type Row = {
  subpath: string
  file: string
  types: string
  summary: string
}

export function buildRows(exports: PackageExports): Row[] {
  const rows: Row[] = []
  for (const [subpath, value] of Object.entries(exports)) {
    if (subpath === '.' || subpath === './index' || subpath.endsWith('.json')) {
      continue
    }
    if (typeof value === 'string' || !value || !value.default) {
      continue
    }
    const def = value.default
    if (!def.startsWith('./dist/')) {
      continue
    }
    const srcPath = def
      .replace(/^\.\/dist\//, () => path.join(rootPath, 'src') + path.sep)
      .replace(/\.js$/, '.ts')
    const display = subpath.slice(2)
    // Link llms.txt at the shipped declaration file (./dist/**/*.d.mts) — the
    // genuinely useful target in a published tarball, where `src/` is absent.
    // Fall back to the runtime entry's `.d.mts` sibling when `types` is unset.
    const types =
      value.types ?? def.replace(/\.js$/, '.d.mts').replace(/\.cjs$/, '.d.cts')
    rows.push({
      subpath: display,
      file: path.relative(rootPath, srcPath).replaceAll(path.sep, '/'),
      types,
      summary: extractSummary(srcPath),
    })
  }
  rows.sort((a, b) => a.subpath.localeCompare(b.subpath))
  return rows
}

/**
 * Bring a source doc comment in line with the fleet prose rules before it is
 * written to a markdown surface.
 *
 * Em-dashes are the whole reason this exists: `prose-em-dashes-are-absent`
 * gates markdown, and every description here is lifted verbatim out of a
 * `@file` block, so 1,624 em-dashes across 480 source files landed in
 * docs/api.md and failed the gate. Fixing the OUTPUT by hand is not durable,
 * because the next `pnpm run docs` regenerates it. The transform is the
 * sanctioned one: swap the em-dash for a plain hyphen and leave the surrounding
 * spacing alone, so ` — ` becomes ` - `.
 */
export function normalizeProse(text: string): string {
  return text.replaceAll('—', '-')
}

export function extractSummary(srcPath: string): string {
  let content: string
  try {
    content = readFileSync(srcPath, 'utf8')
  } catch {
    return ''
  }
  const match = content.match(/\/\*\*([\s\S]*?)\*\//)
  if (!match) {
    return ''
  }
  const block = match[1] ?? ''
  // Accept both `@file` and `@fileoverview`; `@file` is the fleet convention.
  // Check the longer tag first so a `@fileoverview` block isn't matched as
  // `@file` with a leftover "overview" prefix bleeding into the description.
  let overviewIdx = block.indexOf('@fileoverview')
  let tagLength = '@fileoverview'.length
  if (overviewIdx < 0) {
    overviewIdx = block.indexOf('@file')
    tagLength = '@file'.length
  }
  if (overviewIdx < 0) {
    return ''
  }
  const afterTag = block.slice(overviewIdx + tagLength)
  // Strip leading-asterisk continuation and collapse whitespace.
  const flat = afterTag
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\*\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Stop at the first JSDoc tag (lines starting with `@` after normalization).
  const tagBoundary = flat.search(/\s@\w+/)
  const trimmed = normalizeProse(
    (tagBoundary > 0 ? flat.slice(0, tagBoundary) : flat).trim(),
  )
  // First sentence, up to a period or 220 chars.
  const dotIdx = trimmed.indexOf('. ')
  if (dotIdx > 0 && dotIdx < 220) {
    return trimmed.slice(0, dotIdx + 1)
  }
  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed
}

export function groupRows(rows: Row[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>()
  for (let i = 0, { length } = rows; i < length; i += 1) {
    const row = rows[i]!
    const key = row.subpath.includes('/')
      ? `${row.subpath.split('/')[0]}/`
      : 'Top-level'
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  }
  return groups
}

// A namespace table longer than this many rows renders past one GitHub
// viewport, so it gets a <details> fold. Section body is the table plus three
// framing lines, and the fold rule trips past 30 body lines.
const TABLE_FOLD_THRESHOLD = 27

// Names what a folded namespace table contains so a reader can decide whether
// to open it without opening it: the row count, then the sub-namespaces and
// leaf modules inside.
export function renderGroupSummary(key: string, rows: Row[]): string {
  const nested = new Set<string>()
  const leaves: string[] = []
  for (let i = 0, { length } = rows; i < length; i += 1) {
    const parts = rows[i]!.subpath.split('/')
    if (parts.length > 2) {
      nested.add(parts[1]!)
    } else if (parts.length === 2) {
      leaves.push(parts[1]!)
    }
  }
  const names = [...nested, ...leaves]
  const shown = names.slice(0, 12)
  const rest = names.length - shown.length
  const list =
    rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ')
  return `All ${rows.length} ${key} subpaths, alphabetical and linked to source: ${list}`
}

export function renderMarkdown(
  groups: Map<string, Row[]>,
  packageName: string,
): string {
  const keys = [...groups.keys()].toSorted((a, b) => {
    if (a === 'Top-level') {
      return -1
    }
    if (b === 'Top-level') {
      return 1
    }
    return a.localeCompare(b)
  })

  const lines: string[] = []
  lines.push('# API')
  lines.push('')
  lines.push(
    `Every subpath exported by **${packageName}**, grouped by namespace.`,
  )
  lines.push(
    'Each entry links to the source module and shows the first sentence of its `@fileoverview`.',
  )
  lines.push('')
  lines.push(
    '> Regenerate with `pnpm run docs` after adding or removing exports. Do not edit this file by hand.',
  )
  lines.push('')

  const jumpLinks = keys.map(key => {
    const anchor = key
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    return `[${key}](#${anchor})`
  })
  lines.push(`**Jump to:** ${jumpLinks.join(' · ')}`)
  lines.push('')

  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    const rowsForGroup = groups.get(key) ?? []
    // A GitHub markdown viewport is about 45 rendered lines, so a table longer
    // than TABLE_FOLD_THRESHOLD rows pushes the next namespace heading off
    // screen. Fold those behind a <details> whose <summary> names the
    // sub-namespaces inside, so the index stays skimmable closed.
    const folded = rowsForGroup.length > TABLE_FOLD_THRESHOLD
    lines.push(`## ${key}`)
    lines.push('')
    if (folded) {
      lines.push('<details>')
      lines.push(`<summary>${renderGroupSummary(key, rowsForGroup)}</summary>`)
      lines.push('')
    }
    lines.push('| Subpath | Description |')
    lines.push('| --- | --- |')
    for (const row of rowsForGroup) {
      const summary = row.summary || '_(no description)_'
      lines.push(
        `| [\`${packageName}/${row.subpath}\`](../${row.file}) | ${summary} |`,
      )
    }
    if (folded) {
      lines.push('')
      lines.push('</details>')
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function renderLlmsTxt(
  groups: Map<string, Row[]>,
  exportCount: number,
): string {
  const keys = [...groups.keys()].toSorted((a, b) => {
    if (a === 'Top-level') {
      return -1
    }
    if (b === 'Top-level') {
      return 1
    }
    return a.localeCompare(b)
  })

  const lines: string[] = []
  lines.push('# @socketsecurity/lib')
  lines.push('')
  lines.push(
    '> Core utilities and infrastructure for Socket.dev security tools. ' +
      `${exportCount} subpath exports, grouped by namespace.`,
  )
  lines.push('')
  lines.push(
    'Import any namespace by its subpath, e.g. ' +
      "`import { callAiHttpModel } from '@socketsecurity/lib/ai/http'`. " +
      'Each link below points at the TypeScript declarations shipped in the ' +
      'package, where the full signature for that subpath lives.',
  )
  lines.push('')

  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    const heading = key === 'Top-level' ? 'Top-level' : key
    lines.push(`## ${heading}`)
    lines.push('')
    for (const row of groups.get(key) ?? []) {
      const desc = row.summary ? `: ${row.summary}` : ''
      lines.push(`- [@socketsecurity/lib/${row.subpath}](${row.types})${desc}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

async function main(): Promise<void> {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(rootPath, 'package.json'), 'utf8'),
    ) as { exports: PackageExports; name: string }

    const rows = buildRows(pkg.exports)
    const groups = groupRows(rows)

    const apiPath = path.join(rootPath, 'docs', 'api.md')
    writeFileSync(apiPath, renderMarkdown(groups, pkg.name))

    const llmsPath = path.join(rootPath, 'llms.txt')
    writeFileSync(llmsPath, renderLlmsTxt(groups, rows.length))

    // Run oxfmt so the checked-in files match the formatter's expectations
    // (table column alignment, etc.) — otherwise lint fails on every build.
    // Must pass -c so the fleet's oxfmtrc.json (single-quote, no-semi, table
    // alignment behaviour) wins over oxfmt's built-in default config.
    try {
      await spawn(
        // Windows needs the .cmd shim — the extension-less .bin file is a POSIX
        // sh script cmd.exe (shell: isWin32()) can't run.
        isWin32() ? 'node_modules\\.bin\\oxfmt.cmd' : 'node_modules/.bin/oxfmt',
        [
          '-c',
          '.config/fleet/oxfmtrc.json',
          '--ignore-path',
          '.config/fleet/.prettierignore',
          '--write',
          apiPath,
          llmsPath,
        ],
        {
          cwd: rootPath,
          shell: isWin32(),
          stdio: 'ignore',
        },
      )
    } catch {
      // Formatting is best-effort — don't fail the build if oxfmt is missing.
    }
    logger.log(`Wrote ${rows.length} exports to docs/api.md and llms.txt`)
  } catch (e) {
    logger.fail(e)
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'generates docs/api.md and llms.txt from the package.json exports map',
  help: `Usage: node scripts/repo/make-api-md.mts

  No flags. Regenerate whenever the exports map changes.`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
