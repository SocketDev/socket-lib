/**
 * @file Unit tests for the no-namespace-import oxlint rule. Spawns the real
 *   oxlint binary against fixture files in a tmp dir (see lib/rule-tester.mts).
 *   Skips silently when `oxlint` isn't on PATH so a fresh-laptop checkout
 *   doesn't false-fail before `pnpm install` materializes the bin link.
 */

import { describe, test } from 'node:test'

import rule from '../index.mts'
import { RuleTester } from '../../../lib/rule-tester.mts'

describe('socket/no-namespace-import', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('no-namespace-import', rule, {
      valid: [
        {
          name: 'named import',
          code: 'import { foo, bar } from "./mod"\n',
        },
        {
          name: 'default import',
          code: 'import foo from "./mod"\n',
        },
        {
          name: 'namespace import of a node: builtin is exempt',
          code: 'import * as fs from "node:fs"\n',
        },
        {
          name: 'namespace import of a bare builtin is exempt',
          code: 'import * as path from "path"\n',
        },
        {
          name: 'test file: module-mock namespace import is exempt',
          filename: 'src/foo.test.mts',
          code: 'import * as mod from "@socketsecurity/lib/x"\n',
        },
        {
          name: 'file under a /test/ tree is exempt',
          filename: 'test/unit/foo.mts',
          code: 'import * as mod from "../../src/x.mts"\n',
        },
      ],
      invalid: [
        {
          name: 'namespace import of a package subpath',
          code: 'import * as lib from "@socketsecurity/lib/x"\n',
          errors: [{ messageId: 'noNamespaceImport' }],
        },
        {
          name: 'namespace import of a relative module',
          code: 'import * as helpers from "./helpers.mts"\n',
          errors: [{ messageId: 'noNamespaceImport' }],
        },
        {
          name: 'namespace import alongside a default import',
          code: 'import def, * as ns from "./mod"\n',
          errors: [{ messageId: 'noNamespaceImport' }],
        },
      ],
    })
  })
})
