/**
 * @file Unit tests for socket/prefer-normalize-path. A manual path-separator
 *   rewrite (`p.replace(/\\/g, '/')`, `p.replace(/[\\/]/g, '/')`) should use
 *   `normalizePath` from `@socketsecurity/lib/paths/normalize` instead — one
 *   `/`-separated representation across darwin / linux / win32.
 */

import { describe, test } from 'node:test'

import { RuleTester } from '../../../lib/rule-tester.mts'
import rule from '../index.mts'

describe('socket/prefer-normalize-path', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('prefer-normalize-path', rule, {
      valid: [
        {
          name: 'replace with a non-separator regex is fine',
          filename: 'src/transform.mts',
          code: 'const out = p.replace(/foo/g, "bar")\n',
        },
        {
          name: 'replace stripping a CRLF is not a separator rewrite',
          filename: 'src/transform.mts',
          code: 'const out = s.replace(/\\r\\n/g, "\\n")\n',
        },
        {
          name: 'the normalize helper itself is skipped',
          filename: 'src/paths/normalize.mts',
          code: 'const norm = p.replace(/\\\\/g, "/")\n',
        },
        {
          name: 'a non-regex first arg is out of scope',
          filename: 'src/transform.mts',
          code: 'const out = p.replace("\\\\", "/")\n',
        },
      ],
      invalid: [
        {
          name: 'replace over a lone-backslash separator regex',
          filename: 'src/transform.mts',
          code: 'const out = p.replace(/\\\\/g, "/")\n',
          errors: [{ messageId: 'preferNormalizePath' }],
        },
        {
          name: 'replace over a dual-separator character class',
          filename: 'src/transform.mts',
          code: 'const out = p.replace(/[\\\\/]/g, "/")\n',
          errors: [{ messageId: 'preferNormalizePath' }],
        },
        {
          name: 'replaceAll over a flipped dual-separator character class',
          filename: 'src/transform.mts',
          code: 'const out = p.replaceAll(/[/\\\\]/g, "/")\n',
          errors: [{ messageId: 'preferNormalizePath' }],
        },
      ],
    })
  })
})
