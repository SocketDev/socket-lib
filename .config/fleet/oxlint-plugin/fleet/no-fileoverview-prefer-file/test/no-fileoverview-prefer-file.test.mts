/**
 * @file Unit tests for socket/no-fileoverview-prefer-file.
 */

import { describe, test } from 'node:test'

import { RuleTester } from '../../../lib/rule-tester.mts'
import rule from '../index.mts'

describe('socket/no-fileoverview-prefer-file', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('no-fileoverview-prefer-file', rule, {
      valid: [
        {
          name: 'leading file-doc already uses @file',
          code: '/**\n * @file Describes the module.\n */\nexport const x = 1\n',
        },
        {
          name: 'inline // comment mentioning @fileoverview is not flagged',
          code: '// @fileoverview alias is non-standard\nexport const x = 1\n',
        },
        {
          name: '@fileoverview inside a string literal is not flagged',
          code: 'const tag = "@fileoverview"\nexport { tag }\n',
        },
        {
          name: 'non-leading block comment with @fileoverview is not flagged',
          code: 'export const x = 1\n/** @fileoverview extra */\nexport const y = 2\n',
        },
        {
          name: 'no file-doc block at all is not flagged',
          code: 'export const x = 1\n',
        },
      ],
      invalid: [
        {
          name: 'leading file-doc with @fileoverview is flagged and autofixed to @file',
          code: '/**\n * @fileoverview Describes the module.\n */\nexport const x = 1\n',
          errors: [{ messageId: 'preferFile' }],
          output: '/**\n * @file Describes the module.\n */\nexport const x = 1\n',
        },
      ],
    })
  })
})
