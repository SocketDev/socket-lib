/**
 * @file Type-level regression tests for the prompt exports. The 6.1.0/6.2.0
 *   dist d.ts collapsed every prompt to `(...args: unknown[]) =>
 *   Promise<unknown>` because wrapPrompt erased the vendored @inquirer
 *   generics — the lazily-required externals ship no d.ts — so consumers
 *   assigning `await select(...)` / `await input(...)` to typed variables hit
 *   tsc errors. These assertions run at compile time via `pnpm run check`,
 *   which type-checks test/**, and fail if the exports ever degrade to
 *   unknown again. The probe closures are intentionally never invoked —
 *   calling a prompt would open an interactive TTY prompt.
 */

import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  checkbox,
  confirm,
  input,
  password,
  search,
  select,
} from '../../../src/stdio/prompts'

describe('prompt export typings', () => {
  it('select resolves the choice value type, not unknown', () => {
    expectTypeOf(select<string>).returns.resolves.not.toBeUnknown()
    expectTypeOf(select<'yes' | 'no'>).returns.resolves.toEqualTypeOf<
      'yes' | 'no' | undefined
    >()

    const probe = async () => {
      // Mirrors socket-cli suggestOrgSlug(): value inferred from choices.
      const slug = await select({
        message: 'Which org?',
        choices: [
          { name: 'Yes [org]', value: 'org', description: 'Use "org"' },
          { name: 'No', value: '' },
        ],
      })
      expectTypeOf(slug).not.toBeUnknown()
      expectTypeOf(slug).toEqualTypeOf<string | undefined>()
      // The regression class: assignability to a typed variable.
      const assignable: string | undefined = slug
      return assignable
    }
    expect(typeof probe).toBe('function')
  })

  it('input resolves string, not unknown', () => {
    expectTypeOf(input).returns.resolves.not.toBeUnknown()
    expectTypeOf(input).returns.resolves.toEqualTypeOf<string | undefined>()

    const probe = async () => {
      // Mirrors socket-cli setup-scan-config: default + required accepted.
      const repo = await input({
        message: 'Repo name?',
        default: 'my-repo',
        required: false,
      })
      const assignable: string | undefined = repo
      return assignable
    }
    expect(typeof probe).toBe('function')
  })

  it('confirm resolves boolean, not unknown', () => {
    expectTypeOf(confirm).returns.resolves.not.toBeUnknown()
    expectTypeOf(confirm).returns.resolves.toEqualTypeOf<boolean | undefined>()
  })

  it('password resolves string, not unknown', () => {
    expectTypeOf(password).returns.resolves.not.toBeUnknown()
    expectTypeOf(password).returns.resolves.toEqualTypeOf<string | undefined>()
  })

  it('checkbox resolves an array of the choice value type, not unknown', () => {
    expectTypeOf(checkbox<string>).returns.resolves.not.toBeUnknown()
    expectTypeOf(checkbox<string>).returns.resolves.toEqualTypeOf<
      string[] | undefined
    >()
  })

  it('search resolves the choice value type, not unknown', () => {
    expectTypeOf(search<number>).returns.resolves.not.toBeUnknown()
    expectTypeOf(search<number>).returns.resolves.toEqualTypeOf<
      number | undefined
    >()
  })
})
