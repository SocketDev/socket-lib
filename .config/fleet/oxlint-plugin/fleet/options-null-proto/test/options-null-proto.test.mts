/**
 * @file Unit tests for socket/options-null-proto.
 */

import { describe, test } from 'node:test'

import { RuleTester } from '../../../lib/rule-tester.mts'
import rule from '../index.mts'

describe('socket/options-null-proto', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('options-null-proto', rule, {
      valid: [
        {
          name: 'destructure off a null-proto-normalized spread',
          code: 'function f(options?: { cwd?: string }) {\n  const { cwd } = { __proto__: null, ...options }\n  return cwd\n}\n',
        },
        {
          name: 'normalized then read by member access',
          code: 'function f(options?: { x?: number }) {\n  const o = { __proto__: null, ...options }\n  return o.x\n}\n',
        },
        {
          name: 'options passed straight through untouched',
          code: 'function f(options?: object) {\n  return g(options)\n}\n',
        },
        {
          name: 'no options param',
          code: 'function f(x: string) {\n  return x.length\n}\n',
        },
        {
          name: 'commented opt-out',
          code: '// socket-lint: allow options-null-proto\nfunction f(options: { a: number }) {\n  return options.a\n}\n',
        },
        {
          name: 'test file is skipped (mocks, not production readers)',
          code: 'function f(options: { a: number }) {\n  return options.a\n}\n',
          filename: 'foo.test.mts',
        },
        {
          name: 'file under a /test/ tree is skipped',
          code: 'function f(opts: { a: number }) {\n  return opts.a\n}\n',
          filename: 'test/unit/foo.mts',
        },
      ],
      invalid: [
        {
          name: 'destructures options raw (fixable with cast)',
          code: 'function f(options?: { cwd?: string }) {\n  const { cwd } = options\n  return cwd\n}\n',
          output:
            'function f(options?: { cwd?: string }) {\n  const { cwd } = { __proto__: null, ...options } as typeof options\n  return cwd\n}\n',
          errors: [{ messageId: 'banned' }],
        },
        {
          name: 'reads options by member access (fixable via a normalized `opts` local, no shadow)',
          code: 'function f(options: { a: number }) {\n  return options.a\n}\n',
          output:
            'function f(options: { a: number }) {\n  const opts = { __proto__: null, ...options } as typeof options\n  return opts.a\n}\n',
          errors: [{ messageId: 'banned' }],
        },
        {
          name: 'repoints EVERY options.x read at the normalized local',
          code: 'function f(options: { a: number; b: number }) {\n  return options.a + options.b\n}\n',
          output:
            'function f(options: { a: number; b: number }) {\n  const opts = { __proto__: null, ...options } as typeof options\n  return opts.a + opts.b\n}\n',
          errors: [{ messageId: 'banned' }],
        },
        {
          name: '`opts` param destructure is fixed in place (no new binding)',
          code: 'function f(opts?: { n?: number }) {\n  const { n } = opts\n  return n\n}\n',
          output:
            'function f(opts?: { n?: number }) {\n  const { n } = { __proto__: null, ...opts } as typeof opts\n  return n\n}\n',
          errors: [{ messageId: 'banned' }],
        },
        {
          name: '`opts` param member access is REPORT-ONLY (a new `opts` local would shadow the param)',
          code: 'function f(opts: { a: number }) {\n  return opts.a\n}\n',
          // No `output` → the rule reports without a fix; options-param-naming
          // renames the param `opts`→`options` first, then this fix applies.
          errors: [{ messageId: 'banned' }],
        },
      ],
    })
  })
})
