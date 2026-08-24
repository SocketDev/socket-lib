/**
 * @file Unit tests for src/hooks/dispatch-failure — the policy separating a
 *   hook that objected from a hook that could not load.
 *   The load-bearing spec is the last one: an enforcing hook whose checkout has
 *   no install must NOT block. A user-level dispatcher that blocks there
 *   refuses every tool call in every session on the machine, including the
 *   install that would fix it, so the deadlock has no exit from inside. Pure:
 *   the filesystem probe takes an injected predicate.
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  hookRuntimeFacts,
  hookRuntimeVerdict,
  isEnforcingHook,
} from '../../../src/hooks/dispatch-failure.mjs'

const INSTALLED = { depsInstalled: true }
const UNINSTALLED = { depsInstalled: false }
const REPO = '/repos/socket-wheelhouse'

describe('isEnforcingHook', () => {
  it('treats a -guard suffix as enforcing', () => {
    expect(isEnforcingHook('push-protected-branch-guard')).toBe(true)
  })

  it('treats everything else as advisory', () => {
    for (const name of [
      'anti-prose-reminder',
      'bot-comment-sweeper',
      'guard-rail-nudge',
      'guard',
      '',
    ]) {
      expect(isEnforcingHook(name)).toBe(false)
    }
  })

  it('does not match a -guard substring elsewhere in the name', () => {
    expect(isEnforcingHook('guard-something-else')).toBe(false)
  })
})

describe('hookRuntimeFacts', () => {
  it('reports an install when node_modules is present', () => {
    expect(hookRuntimeFacts(REPO, () => true)).toEqual(INSTALLED)
  })

  it('reports no install when node_modules is absent', () => {
    expect(hookRuntimeFacts(REPO, () => false)).toEqual(UNINSTALLED)
  })

  it('probes node_modules directly under the checkout', () => {
    const probed: string[] = []
    hookRuntimeFacts(REPO, p => {
      probed.push(p)
      return false
    })
    expect(probed).toEqual([path.join(REPO, 'node_modules')])
  })
})

describe('hookRuntimeVerdict', () => {
  // An advisory hook has nothing to withhold, so its runtime failing is
  // reportable but never blocking - whether or not an install exists.
  it('never blocks for an advisory hook', () => {
    for (const runtime of [INSTALLED, UNINSTALLED]) {
      const verdict = hookRuntimeVerdict({
        cause: 'ERR_MODULE_NOT_FOUND',
        hookName: 'anti-prose-reminder',
        repoDir: REPO,
        runtime,
      })
      expect(verdict.block).toBe(false)
      expect(verdict.message).toContain('advisory hook')
    }
  })

  // node_modules present means an install exists to be mid-flight, so the very
  // next attempt plausibly runs the real check. That is the only case where
  // withholding the action costs nothing.
  it('blocks an enforcing hook when the checkout has an install', () => {
    const verdict = hookRuntimeVerdict({
      cause: 'ERR_MODULE_NOT_FOUND',
      hookName: 'push-protected-branch-guard',
      repoDir: REPO,
      runtime: INSTALLED,
    })
    expect(verdict.block).toBe(true)
    expect(verdict.message).toContain('failing CLOSED')
    expect(verdict.message).toContain('Retry the command in a moment')
  })

  it('names the hook and the cause in every message', () => {
    for (const runtime of [INSTALLED, UNINSTALLED]) {
      const { message } = hookRuntimeVerdict({
        cause: 'cannot find @socketsecurity/lib-stable/paths/normalize',
        hookName: 'zsh-word-split-guard',
        repoDir: REPO,
        runtime,
      })
      expect(message).toContain('zsh-word-split-guard')
      expect(message).toContain(
        'cannot find @socketsecurity/lib-stable/paths/normalize',
      )
    }
  })

  it('quotes a caller-supplied repair command', () => {
    const { message } = hookRuntimeVerdict({
      cause: 'ERR_MODULE_NOT_FOUND',
      hookName: 'reply-ref-link-guard',
      repairCommand: 'pnpm install --frozen-lockfile',
      repoDir: REPO,
      runtime: UNINSTALLED,
    })
    expect(message).toContain('`pnpm install --frozen-lockfile`')
    expect(message).toContain(REPO)
  })

  it('falls back to a default repair command', () => {
    for (const repairCommand of [undefined, '']) {
      const { message } = hookRuntimeVerdict({
        cause: 'ERR_MODULE_NOT_FOUND',
        hookName: 'reply-ref-link-guard',
        repairCommand,
        repoDir: REPO,
        runtime: UNINSTALLED,
      })
      expect(message).toContain('`pnpm install`')
    }
  })

  // The regression this module exists for. An uninstalled checkout has never
  // had a runtime, so a block withholds an action no rule was applied to and
  // seals off the repair at the same time.
  it('fails OPEN for an enforcing hook when the checkout has no install', () => {
    const verdict = hookRuntimeVerdict({
      cause: 'ERR_MODULE_NOT_FOUND',
      hookName: 'push-protected-branch-guard',
      repoDir: REPO,
      runtime: UNINSTALLED,
    })
    expect(verdict.block).toBe(false)
    expect(verdict.message).toContain('no guard')
    expect(verdict.message).toContain('Failing OPEN')
    expect(verdict.message).not.toContain('Retry')
  })

  // Every enforcing hook, not just the one that happened to fire first: the
  // deadlock was machine-wide precisely because the whole set fails together.
  it('fails open for every enforcing hook in an uninstalled checkout', () => {
    for (const hookName of [
      'anti-prose-guard',
      'bot-comment-collapse-guard',
      'human-gate-ends-turn-guard',
      'prefer-script-emission-guard',
      'push-protected-branch-guard',
      'reply-code-format-guard',
      'reply-ref-link-guard',
      'silent-guard-compliance-guard',
      'zsh-word-split-guard',
    ]) {
      expect(
        hookRuntimeVerdict({
          cause: 'ERR_MODULE_NOT_FOUND',
          hookName,
          repoDir: REPO,
          runtime: UNINSTALLED,
        }).block,
      ).toBe(false)
    }
  })
})
