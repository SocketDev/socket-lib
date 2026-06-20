/**
 * @file Unit tests for socket/no-source-sniffing. A check / generator / lint
 *   rule / unit test must not pattern-match source TEXT to infer behavior —
 *   it imports the module + reads its typed export, or parses the AST.
 */

import { describe, test } from 'node:test'

import { RuleTester } from '../../../lib/rule-tester.mts'
import rule from '../index.mts'

const CHECK = 'scripts/fleet/check/hooks-are-conformant.mts'

describe('socket/no-source-sniffing', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('no-source-sniffing', rule, {
      valid: [
        {
          name: 'regex.test on a non-source value is fine',
          filename: CHECK,
          code: 'const ok = /^v\\d+$/.test(tag)\n',
        },
        {
          name: 'source-named var outside a check/test/plugin file is out of scope',
          filename: 'src/transform.mts',
          code: 'const hit = /export/.test(source)\n',
        },
        {
          name: 'importing the module + reading its typed export is the right way',
          filename: CHECK,
          code: "const mod = await import(p)\nconst ok = mod.hook?.type === 'guard'\n",
        },
        {
          name: 'an honest content check on a read file is NOT source-sniffing',
          filename: CHECK,
          code: "const has = readFileSync(p, 'utf8').includes('\"strict\": true')\n",
        },
      ],
      invalid: [
        {
          name: 'regex.test against a source-named variable',
          filename: CHECK,
          code: 'const conformant = /\\bdefineHook\\b/.test(hookFileSource)\n',
          errors: [{ messageId: 'sourceSniff' }],
        },
        {
          name: 'match() against a source-named variable in a test',
          filename: 'template/base/.claude/hooks/fleet/x/test/index.test.mts',
          code: 'const m = source.match(/process\\.exit/)\n',
          errors: [{ messageId: 'sourceSniff' }],
        },
      ],
    })
  })
})
