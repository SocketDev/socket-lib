/**
 * @file Unit tests for socket/no-malformed-bypass-marker.
 */

import { describe, test } from 'node:test'

import { RuleTester } from '../../../lib/rule-tester.mts'
import rule from '../index.mts'

describe('socket/no-malformed-bypass-marker', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('no-malformed-bypass-marker', rule, {
      valid: [
        {
          name: 'well-formed per-site disable (rule + reason)',
          code:
            '// oxlint-disable-next-line socket/no-console-prefer-logger -- bootstrap log\n' +
            'export const x = 1\n',
        },
        {
          name: 'well-formed disable with multiple rules',
          code:
            '// oxlint-disable-next-line socket/a, socket/b -- both noisy here\n' +
            'export const x = 1\n',
        },
        {
          name: 'well-formed socket-lint allow (token, no reason)',
          code: 'export const o = 1 // socket-lint: allow object-property-order\n',
        },
        {
          name: 'well-formed socket-lint allow (token + reason)',
          code:
            '// socket-lint: allow top-level-await -- ESM-only entry\n' +
            'export const x = 1\n',
        },
        {
          name: 'prose comment merely mentioning the directive is not a directive',
          code:
            '// see oxlint-disable-next-line usage in the docs\n' +
            'export const x = 1\n',
        },
        {
          name: 'JSDoc block showing the marker shape is skipped',
          code:
            '/**\n' +
            ' * Example: `oxlint-disable-next-line socket/foo` (no reason shown).\n' +
            ' */\n' +
            'export const x = 1\n',
        },
        {
          name: 'malformed marker is bypassed by the allow comment above it',
          code:
            '// socket-lint: allow malformed-bypass-marker\n' +
            '// socket-lint: allow\n' +
            'export const x = 1\n',
        },
      ],
      invalid: [
        {
          name: 'per-site disable missing the -- reason',
          code:
            '// oxlint-disable-next-line socket/no-default-export\n' +
            'export const x = 1\n',
          errors: [{ messageId: 'missingDisableReason' }],
        },
        {
          name: 'disable-line variant missing the reason',
          code: 'export const x = 1 // oxlint-disable-line socket/foo\n',
          errors: [{ messageId: 'missingDisableReason' }],
        },
        {
          name: 'disable with a reason but NO rule (silences everything)',
          code:
            '// oxlint-disable-next-line -- just because\n' +
            'export const x = 1\n',
          errors: [{ messageId: 'missingDisableReason' }],
        },
        {
          name: 'socket-lint allow with no token',
          code: 'export const x = 1 // socket-lint: allow\n',
          errors: [{ messageId: 'malformedSocketLintAllow' }],
        },
      ],
    })
  })
})
