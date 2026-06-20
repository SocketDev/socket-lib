/**
 * @file Unit tests for socket/guard-contract. A hook index.mts that imports the
 *   _shared/guard.mts contract must not call process.exit or gate on
 *   process.argv[1]. A side-effect hook that doesn't import the contract — or a
 *   non-hook / _shared / test file — is exempt.
 */

import { describe, test } from 'node:test'

import { RuleTester } from '../../../lib/rule-tester.mts'
import rule from '../index.mts'

const GUARD = '.claude/hooks/fleet/example-guard/index.mts'

describe('socket/guard-contract', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('guard-contract', rule, {
      valid: [
        {
          name: 'clean contract guard (no exit, no argv gate)',
          filename: GUARD,
          code: "import { bashGuard, runGuard } from '../_shared/guard.mts'\nexport const check = bashGuard(() => undefined)\nawait runGuard(check, import.meta.url)\n",
        },
        {
          name: 'side-effect hook that does NOT import the contract may exit',
          filename: '.claude/hooks/fleet/sweeper/index.mts',
          code: "import process from 'node:process'\nprocess.exit(0)\n",
        },
        {
          name: 'non-hook file is out of scope',
          filename: 'src/cli.mts',
          code: "import { runGuard } from './guard.mts'\nprocess.exit(0)\n",
        },
        {
          name: 'the _shared lib itself is exempt',
          filename: '.claude/hooks/fleet/_shared/guard.mts',
          code: 'process.exit(0)\nconst x = process.argv[1]\n',
        },
      ],
      invalid: [
        {
          name: 'contract guard calling process.exit',
          filename: GUARD,
          code: "import { runGuard } from '../_shared/guard.mts'\nif (!ok) {\n  process.exit(0)\n}\nawait runGuard(check, import.meta.url)\n",
          errors: [{ messageId: 'processExit' }],
        },
        {
          name: 'contract guard gating on process.argv[1]',
          filename: GUARD,
          code: "import { block, runGuard } from '../_shared/guard.mts'\nif (process.argv[1]) {\n  await runGuard(check, import.meta.url)\n}\n",
          errors: [{ messageId: 'argvGate' }],
        },
      ],
    })
  })
})
