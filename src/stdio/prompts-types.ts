/**
 * @file Type definitions for the interactive prompt wrappers in
 *   `./prompts`. Config and signature types mirror the vendored @inquirer
 *   prompts — the lazily-required external bundles ship no d.ts, so these are
 *   the published typings consumers compile against.
 */

import type { Remap } from '../objects/types'
import type { SpinnerInstance } from '../spinner/types'
import type { ThemeName } from '../themes/themes'
import type { Theme } from '../themes/types'

/**
 * Choice option for select and search prompts.
 *
 * @template Value - Type of the choice value.
 */
export interface Choice<Value = unknown> {
  /**
   * The value returned when this choice is selected.
   */
  value: Value
  /**
   * Display name for the choice (defaults to value.toString())
   */
  name?: string | undefined
  /**
   * Additional description text shown below the choice.
   */
  description?: string | undefined
  /**
   * Short text shown after selection (defaults to name)
   */
  short?: string | undefined
  /**
   * Whether this choice is disabled, or a reason string.
   */
  disabled?: boolean | string | undefined
}

/**
 * Context for inquirer prompts. Minimal context interface used by Inquirer
 * prompts. Duplicated from `@inquirer/type` - InquirerContext.
 */
export interface InquirerContext {
  /**
   * Abort signal for cancelling the prompt.
   */
  signal?: AbortSignal | undefined
  /**
   * Input stream (defaults to process.stdin)
   */
  input?: NodeJS.ReadableStream | undefined
  /**
   * Output stream (defaults to process.stdout)
   */
  output?: NodeJS.WritableStream | undefined
  /**
   * Clear the prompt from terminal when done.
   */
  clearPromptOnDone?: boolean | undefined
}

/**
 * Extended context with spinner support. Allows passing a spinner instance to
 * be managed during prompts.
 */
export type Context = Remap<
  InquirerContext & {
    /**
     * Optional spinner to stop/start during prompt display.
     */
    spinner?: SpinnerInstance | undefined
  }
>

/**
 * Separator for visual grouping in select/checkbox prompts. Creates a
 * non-selectable visual separator line. Duplicated from `@inquirer/select` -
 * Separator. This type definition ensures the Separator type is available in
 * published packages.
 *
 * @example
 *   import { Separator } from './prompts'
 *
 *   const choices = [
 *     { name: 'Option 1', value: 1 },
 *     new Separator(),
 *     { name: 'Option 2', value: 2 },
 *   ]
 */
export declare class SeparatorType {
  readonly separator: string
  readonly type: 'separator'
  constructor(separator?: string)
}

export type Separator = SeparatorType

/**
 * Theme accepted by prompt configs. `wrapPrompt` routes the value through
 * `createInquirerTheme`, so Socket theme names, Socket `Theme` objects, and
 * raw @inquirer theme objects are all valid.
 */
export type PromptTheme = Theme | ThemeName | Record<string, unknown>

/**
 * Choice option for checkbox prompts. Extends `Choice` with checkbox-only
 * fields mirrored from `@inquirer/checkbox`.
 *
 * @template Value - Type of the choice value.
 */
export interface CheckboxChoice<Value = unknown> extends Choice<Value> {
  /**
   * Whether this choice starts checked.
   */
  checked?: boolean | undefined
  /**
   * Display name used while the choice is checked (defaults to name)
   */
  checkedName?: string | undefined
}

/**
 * Config for `checkbox`. Mirrors `@inquirer/checkbox` with Socket theme
 * support.
 *
 * @template Value - Type of the choice values.
 */
export interface CheckboxConfig<Value = unknown> {
  message: string
  choices: ReadonlyArray<Separator | Value | CheckboxChoice<Value>>
  instructions?: string | boolean | undefined
  loop?: boolean | undefined
  pageSize?: number | undefined
  prefix?: string | undefined
  required?: boolean | undefined
  shortcuts?:
    | { all?: string | null | undefined; invert?: string | null | undefined }
    | undefined
  validate?:
    | ((
        choices: ReadonlyArray<CheckboxChoice<Value>>,
      ) => boolean | string | Promise<boolean | string>)
    | undefined
  theme?: PromptTheme | undefined
}

/**
 * Config for `confirm`. Mirrors `@inquirer/confirm` with Socket theme support.
 */
export interface ConfirmConfig {
  message: string
  default?: boolean | undefined
  transformer?: ((value: boolean) => string) | undefined
  theme?: PromptTheme | undefined
}

/**
 * Config for `input`. Mirrors `@inquirer/input` with Socket theme support.
 */
export interface InputConfig {
  message: string
  default?: string | undefined
  pattern?: RegExp | undefined
  patternError?: string | undefined
  prefill?: 'tab' | 'editable' | undefined
  required?: boolean | undefined
  transformer?:
    | ((value: string, flags: { isFinal: boolean }) => string)
    | undefined
  validate?:
    | ((value: string) => boolean | string | Promise<boolean | string>)
    | undefined
  theme?: PromptTheme | undefined
}

/**
 * Config for `password`. Mirrors `@inquirer/password` with Socket theme
 * support.
 */
export interface PasswordConfig {
  message: string
  mask?: boolean | string | undefined
  validate?:
    | ((value: string) => boolean | string | Promise<boolean | string>)
    | undefined
  theme?: PromptTheme | undefined
}

/**
 * Config for `search`. Mirrors `@inquirer/search` with Socket theme support.
 *
 * @template Value - Type of the choice values.
 */
export interface SearchConfig<Value = unknown> {
  message: string
  source: (
    term: string | undefined,
    opt: { signal: AbortSignal },
  ) =>
    | ReadonlyArray<Separator | Value | Choice<Value>>
    | Promise<ReadonlyArray<Separator | Value | Choice<Value>>>
  default?: NoInfer<Value> | undefined
  pageSize?: number | undefined
  validate?:
    | ((value: Value) => boolean | string | Promise<boolean | string>)
    | undefined
  theme?: PromptTheme | undefined
}

/**
 * Config for `select`. Mirrors `@inquirer/select` with Socket theme support.
 *
 * @template Value - Type of the choice values.
 */
export interface SelectConfig<Value = unknown> {
  message: string
  choices: ReadonlyArray<Separator | Value | Choice<Value>>
  default?: NoInfer<Value> | undefined
  loop?: boolean | undefined
  pageSize?: number | undefined
  theme?: PromptTheme | undefined
}

// Typed signatures for the wrapped prompts. `wrapPrompt` erases the vendored
// prompt's generics — the lazily-required externals ship no d.ts — so each
// export is asserted back to the real @inquirer call signature. Every prompt
// resolves `undefined` when cancelled: wrapPrompt swallows cancellation.

export type CheckboxPrompt = <Value = unknown>(
  config: CheckboxConfig<Value>,
  context?: Context | undefined,
) => Promise<Value[] | undefined>

export type ConfirmPrompt = (
  config: ConfirmConfig,
  context?: Context | undefined,
) => Promise<boolean | undefined>

export type InputPrompt = (
  config: InputConfig,
  context?: Context | undefined,
) => Promise<string | undefined>

export type PasswordPrompt = (
  config: PasswordConfig,
  context?: Context | undefined,
) => Promise<string | undefined>

export type SearchPrompt = <Value = unknown>(
  config: SearchConfig<Value>,
  context?: Context | undefined,
) => Promise<Value | undefined>

export type SelectPrompt = <Value = unknown>(
  config: SelectConfig<Value>,
  context?: Context | undefined,
) => Promise<Value | undefined>
