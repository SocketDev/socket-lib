/**
 * @file Unit tests for the no-stable-import-in-test-actual oxlint rule. Spawns the real
 *   oxlint binary against fixture files in a tmp dir (see lib/rule-tester.mts).
 *   The rule fires in `*.test.*` files when a `-stable` binding appears as the
 *   ACTUAL inside `expect(<actual>)`. Skips silently when `oxlint` isn't on PATH.
 */

import { describe, test } from 'node:test'

import { RuleTester } from '../lib/rule-tester.mts'
import rule from '../rules/no-stable-import-in-test-actual.mts'

describe('socket/no-stable-import-in-test-actual', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('no-stable-import-in-test-actual', rule, {
      valid: [
        {
          name: 'actual from src is fine',
          filename: 'test/unit/foo.test.mts',
          code: "import { doThing } from '../../src/foo'\nexpect(doThing()).toBe(1)\n",
        },
        {
          name: '-stable binding used to BUILD the expected value is fine',
          filename: 'test/unit/constants/platform.test.mts',
          code: "import { getArch } from '@socketsecurity/lib-stable/constants/platform'\nimport { getTarget } from '../../../src/constants/platform'\nexpect(getTarget()).toContain(getArch())\n",
        },
        {
          name: '-stable import not used in any expect is fine',
          filename: 'test/unit/foo.test.mts',
          code: "import { setup } from '@socketsecurity/lib-stable/helper'\nsetup()\nexpect(1).toBe(1)\n",
        },
        {
          name: '-stable import in a NON-test file is not flagged',
          filename: 'src/foo.ts',
          code: "import { cacheKey } from '@socketsecurity/lib-stable/x'\nexpect(cacheKey()).toBe(1)\n",
        },
      ],
      invalid: [
        {
          name: '-stable binding used as the actual under test',
          filename: 'test/unit/external-tools/skillspector/resolve.test.mts',
          code: "import { cacheKey } from '@socketsecurity/lib-stable/external-tools/skillspector/resolve'\nexpect(cacheKey({})).toBe(cacheKey({}))\n",
          errors: [{ messageId: 'stableActualInExpect' }],
        },
        {
          name: '-stable predicate as the actual',
          filename: 'test/isolated/http-request-checksums.test.mts',
          code: "import { isIntegrity } from '@socketsecurity/lib-stable/integrity'\nexpect(isIntegrity(s)).toBe(true)\n",
          errors: [{ messageId: 'stableActualInExpect' }],
        },
      ],
    })
  })
})
