/**
 * @file Integration test for socket-repo/no-inline-lazy-node-getter. The fleet
 *   RuleTester is hardcoded to the fleet plugin + `socket/` namespace, so a
 *   repo rule under `socket-repo/` can't use it. Instead this test exercises
 *   the real repo overlay (`.config/repo/oxlintrc.json` → extends fleet + loads
 *   the repo plugin) end-to-end: write a fixture, run oxlint with the repo
 *   config, assert the finding fires (and `--fix` rewrites to the bound-const
 *   form).
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

import { whichSync } from '@socketsecurity/lib-stable/bin/which'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// Plugin entry, absolute so the spawned oxlint resolves it from a tmpdir.
const PLUGIN_INDEX = path.resolve(HERE, '..', 'index.mts')
const NODE_MODULES_BIN = path.resolve(
  HERE,
  '..',
  '..',
  '..',
  '..',
  'node_modules',
  '.bin',
)

const RULE_NAME = 'no-inline-lazy-node-getter'

/**
 * Oxlint renders the rule id as either `socket-repo/<name>` (diagnostic ruleId)
 * or `socket-repo(<name>)` (compact code form) depending on reporter. Match
 * either.
 */
function hasRuleFinding(stdout: string): boolean {
  return (
    stdout.includes(`socket-repo/${RULE_NAME}`) ||
    stdout.includes(`socket-repo(${RULE_NAME})`)
  )
}

/**
 * Resolve the locally-installed oxlint, never a global PATH copy (per
 * socket/no-which-for-local-bin). Returns undefined when it isn't installed so
 * the cases skip gracefully instead of failing.
 */
function resolveOxlintBinary(): string | undefined {
  const found = whichSync('oxlint', { path: NODE_MODULES_BIN, nothrow: true })
  return typeof found === 'string' ? found : undefined
}

function runOxlint(
  code: string,
  fix: boolean,
): { stdout: string; code: string } {
  const tmpdir = mkdtempSync(path.join(os.tmpdir(), 'oxlint-repo-rule-'))
  const fixture = path.join(tmpdir, 'fixture.ts')
  // Minimal isolated config: just this plugin + rule, no `extends`/
  // ignorePatterns (the full overlay's fleet inheritance is verified by
  // `pnpm run lint`, not here). Keeps the unit test independent of the
  // fleet config and resolvable from a tmpdir.
  const config = path.join(tmpdir, '.oxlintrc.json')
  writeFileSync(
    config,
    JSON.stringify({
      plugins: [],
      jsPlugins: [PLUGIN_INDEX],
      rules: { 'socket-repo/no-inline-lazy-node-getter': 'error' },
    }),
  )
  writeFileSync(fixture, code)
  try {
    const args = ['-c', config]
    if (fix) {
      args.push('--fix')
    }
    args.push(fixture)
    const result = spawnSync(resolveOxlintBinary() ?? 'oxlint', args, {
      encoding: 'utf8',
    })
    return {
      stdout: String(result.stdout ?? ''),
      code: fix ? readFileSync(fixture, 'utf8') : '',
    }
  } finally {
    safeDeleteSync(tmpdir)
  }
}

describe('socket-repo/no-inline-lazy-node-getter', () => {
  test('flags getFs().member inline access', () => {
    if (!resolveOxlintBinary()) {
      return
    }
    const { stdout } = runOxlint(
      'function f() {\n  return getFs().existsSync("/x")\n}\n',
      false,
    )
    assert.ok(
      hasRuleFinding(stdout),
      `expected ${RULE_NAME} finding, got:\n${stdout}`,
    )
  })

  test('does not flag a bound-const getter', () => {
    if (!resolveOxlintBinary()) {
      return
    }
    const { stdout } = runOxlint(
      'function f() {\n  const fs = getFs()\n  return fs.existsSync("/x")\n}\n',
      false,
    )
    assert.ok(
      !hasRuleFinding(stdout),
      `expected no ${RULE_NAME} finding, got:\n${stdout}`,
    )
  })

  test('autofix hoists the const and rewrites the call', () => {
    if (!resolveOxlintBinary()) {
      return
    }
    const { code } = runOxlint(
      'function f() {\n  return getNodePath().join("a", "b")\n}\n',
      true,
    )
    assert.ok(
      code.includes('const path = getNodePath()'),
      `expected hoisted const, got:\n${code}`,
    )
    assert.ok(
      code.includes('path.join("a", "b")'),
      `expected rewritten call, got:\n${code}`,
    )
    assert.ok(
      !/getNodePath\(\)\.join/.test(code),
      `expected no remaining inline call, got:\n${code}`,
    )
  })

  test('autofix dedupes two inline calls of the same getter in one statement', () => {
    if (!resolveOxlintBinary()) {
      return
    }
    const { code } = runOxlint(
      'function f(x) {\n  return getNodePath().basename(x, getNodePath().extname(x))\n}\n',
      true,
    )
    const hoists = (code.match(/const path = getNodePath\(\)/g) ?? []).length
    assert.equal(
      hoists,
      1,
      `expected exactly one hoisted const, got ${hoists}:\n${code}`,
    )
    assert.ok(
      code.includes('path.basename(x, path.extname(x))'),
      `expected both calls rewritten, got:\n${code}`,
    )
  })

  test('autofix keeps a leading oxlint-disable-next-line attached to its statement', () => {
    if (!resolveOxlintBinary()) {
      return
    }
    const { code } = runOxlint(
      'function f(p) {\n  // oxlint-disable-next-line some/rule -- intentional\n  return getFs().statSync(p)\n}\n',
      true,
    )
    // The hoisted const must land BEFORE the disable comment, so the directive
    // still sits on the line directly above the statSync statement.
    assert.ok(
      /const fs = getFs\(\)\n\s*\/\/ oxlint-disable-next-line[^\n]*\n\s*return fs\.statSync/.test(
        code,
      ),
      `expected hoist before the disable comment, got:\n${code}`,
    )
  })
})
