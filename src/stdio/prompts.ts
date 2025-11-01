/**
 * @fileoverview User prompt utilities for interactive scripts.
 * Provides inquirer.js integration with spinner support and context handling.
 */

import { getAbortSignal, getSpinner } from '#constants/process'

const abortSignal = getAbortSignal()
const spinner = getSpinner()

// Type definitions

/**
 * Choice option for select and search prompts.
 *
 * @template Value - Type of the choice value
 */
export interface Choice<Value = unknown> {
  /** The value returned when this choice is selected */
  value: Value
  /** Display name for the choice (defaults to value.toString()) */
  name?: string | undefined
  /** Additional description text shown below the choice */
  description?: string | undefined
  /** Short text shown after selection (defaults to name) */
  short?: string | undefined
  /** Whether this choice is disabled, or a reason string */
  disabled?: boolean | string | undefined
}

/**
 * Context for inquirer prompts.
 * Minimal context interface used by Inquirer prompts.
 * Duplicated from `@inquirer/type` - InquirerContext.
 */
interface InquirerContext {
  /** Abort signal for cancelling the prompt */
  signal?: AbortSignal | undefined
  /** Input stream (defaults to process.stdin) */
  input?: NodeJS.ReadableStream | undefined
  /** Output stream (defaults to process.stdout) */
  output?: NodeJS.WritableStream | undefined
  /** Clear the prompt from terminal when done */
  clearPromptOnDone?: boolean | undefined
}

/**
 * Extended context with spinner support.
 * Allows passing a spinner instance to be managed during prompts.
 */
export type Context = import('../objects').Remap<
  InquirerContext & {
    /** Optional spinner to stop/start during prompt display */
    spinner?: import('../spinner').Spinner | undefined
  }
>

/**
 * Separator for visual grouping in select/checkbox prompts.
 * Creates a non-selectable visual separator line.
 * Duplicated from `@inquirer/select` - Separator.
 * This type definition ensures the Separator type is available in published packages.
 *
 * @example
 * import { Separator } from './prompts'
 *
 * const choices = [
 *   { name: 'Option 1', value: 1 },
 *   new Separator(),
 *   { name: 'Option 2', value: 2 }
 * ]
 */
declare class SeparatorType {
  readonly separator: string
  readonly type: 'separator'
  constructor(separator?: string)
}

export type Separator = SeparatorType

/**
 * Wrap an inquirer prompt with spinner handling and signal injection.
 * Automatically stops/starts spinners during prompt display and injects abort signals.
 * Trims string results and handles cancellation gracefully.
 *
 * @template T - Type of the prompt result
 * @param inquirerPrompt - The inquirer prompt function to wrap
 * @returns Wrapped prompt function with spinner and signal handling
 *
 * @example
 * const myPrompt = wrapPrompt(rawInquirerPrompt)
 * const result = await myPrompt({ message: 'Enter name:' })
 */
/*@__NO_SIDE_EFFECTS__*/
export function wrapPrompt<T = unknown>(
  inquirerPrompt: (...args: unknown[]) => Promise<T>,
): (...args: unknown[]) => Promise<T | undefined> {
  return async (...args) => {
    const origContext = (args.length > 1 ? args[1] : undefined) as
      | Context
      | undefined
    const { spinner: contextSpinner, ...contextWithoutSpinner } =
      origContext ?? ({} as Context)
    const spinnerInstance =
      contextSpinner !== undefined ? contextSpinner : spinner
    const signal = abortSignal
    if (origContext) {
      args[1] = {
        signal,
        ...contextWithoutSpinner,
      }
    } else {
      args[1] = { signal }
    }
    const wasSpinning = !!spinnerInstance?.isSpinning
    spinnerInstance?.stop()
    let result: unknown
    try {
      result = await inquirerPrompt(...args)
    } catch (e) {
      if (e instanceof TypeError) {
        throw e
      }
    }
    if (wasSpinning) {
      spinnerInstance.start()
    }
    return (typeof result === 'string' ? result.trim() : result) as
      | T
      | undefined
  }
}

// c8 ignore start - Third-party inquirer library requires and exports not testable in isolation.
const confirmExport = /*@__PURE__*/ require('../external/@inquirer/confirm')
const inputExport = /*@__PURE__*/ require('../external/@inquirer/input')
const passwordExport = /*@__PURE__*/ require('../external/@inquirer/password')
const searchExport = /*@__PURE__*/ require('../external/@inquirer/search')
const selectExport = /*@__PURE__*/ require('../external/@inquirer/select')
const confirmRaw = confirmExport.default ?? confirmExport
const inputRaw = inputExport.default ?? inputExport
const passwordRaw = passwordExport.default ?? passwordExport
const searchRaw = searchExport.default ?? searchExport
const selectRaw = selectExport.default ?? selectExport
const ActualSeparator = selectExport.Separator
// c8 ignore stop

/**
 * Prompt for a yes/no confirmation.
 * Wrapped with spinner handling and abort signal support.
 *
 * @example
 * const answer = await confirm({ message: 'Continue?' })
 * if (answer) { // user confirmed }
 */
export const confirm: typeof confirmRaw = wrapPrompt(confirmRaw)

/**
 * Prompt for text input.
 * Wrapped with spinner handling and abort signal support.
 * Result is automatically trimmed.
 *
 * @example
 * const name = await input({ message: 'Enter your name:' })
 */
export const input: typeof inputRaw = wrapPrompt(inputRaw)

/**
 * Prompt for password input (hidden characters).
 * Wrapped with spinner handling and abort signal support.
 *
 * @example
 * const token = await password({ message: 'Enter API token:' })
 */
export const password: typeof passwordRaw = wrapPrompt(passwordRaw)

/**
 * Prompt with searchable/filterable choices.
 * Wrapped with spinner handling and abort signal support.
 *
 * @example
 * const result = await search({
 *   message: 'Select a package:',
 *   source: async (input) => fetchPackages(input)
 * })
 */
export const search: typeof searchRaw = wrapPrompt(searchRaw)

/**
 * Prompt to select from a list of choices.
 * Wrapped with spinner handling and abort signal support.
 *
 * @example
 * const choice = await select({
 *   message: 'Choose an option:',
 *   choices: [
 *     { name: 'Option 1', value: 'opt1' },
 *     { name: 'Option 2', value: 'opt2' }
 *   ]
 * })
 */
export const select: typeof selectRaw = wrapPrompt(selectRaw)

export { ActualSeparator as Separator }

/**
 * Create a separator for select prompts.
 * Creates a visual separator line in choice lists.
 *
 * @param text - Optional separator text (defaults to '───────')
 * @returns Separator instance
 *
 * @example
 * import { select, createSeparator } from '@socketsecurity/lib/stdio/prompts'
 *
 * const choice = await select({
 *   message: 'Choose an option:',
 *   choices: [
 *     { name: 'Option 1', value: 1 },
 *     createSeparator(),
 *     { name: 'Option 2', value: 2 }
 *   ]
 * })
 */
export function createSeparator(
  text?: string,
): InstanceType<typeof ActualSeparator> {
  return new ActualSeparator(text)
}
