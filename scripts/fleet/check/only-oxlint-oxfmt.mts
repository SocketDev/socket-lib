/**
 * @file Code-is-law check for the fleet "oxlint + oxfmt only" rule. Scans the
 *   COMMITTED state (git-tracked files) for foreign linter/formatter configs +
 *   package.json deps that the edit-time `no-other-linters-guard` hook blocks —
 *   so a config/dep that slipped in before the hook existed (or via
 *   --no-verify) is caught at `check --all` time. The hook is the edit-time
 *   block; this is the committed-state gate;
 *   `socket/no-eslint-biome-config-ref` reports source refs. Fails (exit 1) on:
 *   a tracked biome.json(c) / .eslintrc* / eslint.config.* / .prettierrc* /
 *   prettier.config.* / .dprint.json* config, or a tracked package.json with
 *   @biomejs/biome / eslint / @eslint/* / @typescript-eslint/* / prettier /
 *   dprint / rome (+ the eslint-config-* / eslint-plugin-* / prettier-plugin-*
 *   / @<scope>/eslint-* families) in any dependency block. EXEMPT: vendored
 *   upstream trees (upstream/, vendor/, third_party/, external/, a path segment
 *   ending `-upstream`). We never touch upstream files.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { REPO_ROOT } from '../paths.mts'

const logger = getDefaultLogger()

const CONFIG_FILE_RE =
  /^(?:biome\.jsonc?|\.eslintrc(?:\.[a-z]+)?|eslint\.config\.[cm]?[jt]s|\.prettierrc(?:\.[a-z]+)?|prettier\.config\.[cm]?[jt]s|\.dprint\.jsonc?)$/

function isForeignToolPackage(name: string): boolean {
  if (
    name === '@biomejs/biome' ||
    name === 'eslint' ||
    name === 'prettier' ||
    name === 'dprint' ||
    name === 'rome'
  ) {
    return true
  }
  return (
    name.startsWith('@eslint/') ||
    name.startsWith('@typescript-eslint/') ||
    name.startsWith('eslint-config-') ||
    name.startsWith('eslint-plugin-') ||
    name.startsWith('prettier-plugin-') ||
    /^@[^/]+\/eslint-/.test(name)
  )
}

export function isVendoredUpstream(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/')
  return (
    /(?:^|\/)(?:upstream|vendor|third_party|external)(?:\/|$)/.test(p) ||
    /(?:^|\/)[^/]+-upstream(?:\/|$)/.test(p)
  )
}

function trackedFiles(): string[] {
  const result = spawnSync('git', ['ls-files'], { stdio: 'pipe' })
  const out = typeof result.stdout === 'string' ? result.stdout : ''
  return out.split('\n').filter(Boolean)
}

function foreignToolDeps(jsonText: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') {
    return []
  }
  const out: string[] = []
  for (const block of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const deps = (parsed as Record<string, unknown>)[block]
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps as Record<string, unknown>)) {
        if (isForeignToolPackage(name)) {
          out.push(name)
        }
      }
    }
  }
  return out
}

function main(): void {
  const failures: string[] = []
  for (const rel of trackedFiles()) {
    if (isVendoredUpstream(rel)) {
      continue
    }
    const basename = path.basename(rel)
    if (CONFIG_FILE_RE.test(basename)) {
      failures.push(`${rel}: foreign linter/formatter config file`)
      continue
    }
    if (basename === 'package.json') {
      let text: string
      try {
        text = readFileSync(path.join(REPO_ROOT, rel), 'utf8')
      } catch {
        continue
      }
      const found = foreignToolDeps(text)
      if (found.length) {
        failures.push(`${rel}: foreign tool dep(s) ${found.sort().join(', ')}`)
      }
    }
  }

  if (failures.length) {
    logger.error(
      `[only-oxlint-oxfmt] ${failures.length} foreign linter/formatter surface(s) — the fleet uses oxlint + oxfmt only:`,
    )
    for (let i = 0, { length } = failures; i < length; i += 1) {
      logger.error(`  ${failures[i]!}`)
    }
    logger.error(
      'Remove the config/dep; use the fleet oxlint plugin + oxfmt. Vendored upstream (upstream/, vendor/, *-upstream) is exempt.',
    )
    process.exitCode = 1
    return
  }
  logger.success(
    '[only-oxlint-oxfmt] no foreign linters/formatters in tracked files.',
  )
}

main()
