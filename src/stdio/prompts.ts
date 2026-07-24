/**
 * @file User prompt utilities for interactive scripts. Provides inquirer.js
 *   integration with spinner support, context handling, and theming.
 */

import { getAbortSignal } from '../process/abort'
import { applyColor } from '../logger/colors'

import type { ColorValue } from '../colors/types'
import { getDefaultSpinner } from '../spinner/default'
import { getTheme } from '../themes/context'
import { THEMES } from '../themes/themes'
import type { ThemeName } from '../themes/themes'
import type { Theme } from '../themes/types'
import { resolveColor } from '../themes/resolve'

import type {
  CheckboxPrompt,
  ConfirmPrompt,
  Context,
  InputPrompt,
  PasswordPrompt,
  SearchPrompt,
  SelectPrompt,
  SeparatorType,
} from './prompts-types'

// Re-export the prompt type surface so consumers keep importing from
// '@socketsecurity/lib/stdio/prompts'. Definitions live in ./prompts-types.
export type {
  CheckboxChoice,
  CheckboxConfig,
  CheckboxPrompt,
  Choice,
  ConfirmConfig,
  ConfirmPrompt,
  Context,
  InputConfig,
  InputPrompt,
  InquirerContext,
  PasswordConfig,
  PasswordPrompt,
  PromptTheme,
  SearchConfig,
  SearchPrompt,
  SelectConfig,
  SelectPrompt,
  SeparatorType,
} from './prompts-types'

// A separate alias rather than a re-export: `export type { Separator }` would
// collide with the `Separator` proxy const exported below.
export type Separator = SeparatorType

/**
 * Convert Socket theme to @inquirer theme format. Maps our theme colors to
 * inquirer's style functions. Handles theme names, Theme objects, and passes
 * through @inquirer themes.
 *
 * @example
 *   ;```ts
 *   // Socket theme name
 *   createInquirerTheme('sunset')
 *
 *   // Socket Theme object
 *   createInquirerTheme(SUNSET_THEME)
 *
 *   // @inquirer theme (passes through)
 *   createInquirerTheme({ style: {...}, icon: {...} })
 *   ```
 *
 * @param theme - Socket theme name, Theme object, or @inquirer theme.
 *
 * @returns @inquirer theme object
 */
export function createInquirerTheme(
  theme: Theme | ThemeName | unknown,
): Record<string, unknown> {
  // If it's a string (theme name) or Socket Theme object, convert it
  if (typeof theme === 'string' || isSocketTheme(theme)) {
    const socketTheme = resolveTheme(theme as Theme | ThemeName)
    const promptColor = resolveColor(
      socketTheme.colors.prompt,
      socketTheme.colors,
    ) as ColorValue
    const textDimColor = resolveColor(
      socketTheme.colors.textDim,
      socketTheme.colors,
    ) as ColorValue
    const errorColor = socketTheme.colors.error
    const successColor = socketTheme.colors.success
    const primaryColor = socketTheme.colors.primary

    return {
      style: {
        // Message text (uses colors.prompt)
        message: (text: string) => applyColor(text, promptColor),
        // Answer text (uses primary color)
        answer: (text: string) => applyColor(text, primaryColor),
        // Help text / descriptions (uses textDim)
        help: (text: string) => applyColor(text, textDimColor),
        description: (text: string) => applyColor(text, textDimColor),
        // Disabled items (uses textDim)
        disabled: (text: string) => applyColor(text, textDimColor),
        // Error messages (uses error color)
        error: (text: string) => applyColor(text, errorColor),
        // Highlight/active (uses primary color)
        highlight: (text: string) => applyColor(text, primaryColor),
      },
      icon: {
        // oxlint-disable-next-line socket/no-status-emoji -- Inquirer theme icon; consumed by the prompt library, not log output.
        checked: applyColor('✓', successColor),
        unchecked: ' ',
        cursor: applyColor('❯', primaryColor),
      },
    }
  }

  // Undefined/null collapse to an empty theme so callers can pass
  // `getTheme()` without a guard. @inquirer accepts an empty theme
  // object and falls back to its built-in default palette.
  if (theme === undefined || theme === null) {
    return {}
  }
  // Otherwise it's already an @inquirer theme, return as-is
  return theme as Record<string, unknown>
}

/**
 * Create a separator for select prompts. Creates a visual separator line in
 * choice lists.
 *
 * @example
 *   import { select, createSeparator } from '@socketsecurity/lib/stdio/prompts'
 *
 *   const choice = await select({
 *     message: 'Choose an option:',
 *     choices: [
 *       { name: 'Option 1', value: 1 },
 *       createSeparator(),
 *       { name: 'Option 2', value: 2 },
 *     ],
 *   })
 *
 * @param text - Optional separator text (defaults to '───────')
 *
 * @returns Separator instance
 */
export function createSeparator(text?: string | undefined): SeparatorType {
  return new (require('../external/@inquirer/select').Separator)(text)
}

/**
 * Check if value is a Socket Theme object.
 *
 * @param value - Value to check.
 *
 * @returns True if value is a Socket Theme
 */
export function isSocketTheme(value: unknown): value is Theme {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'colors' in value
  )
}

/**
 * Resolve theme name or object to Theme.
 *
 * @param theme - Theme name or object.
 *
 * @returns Resolved Theme
 */
export function resolveTheme(theme: Theme | ThemeName): Theme {
  return typeof theme === 'string' ? (THEMES[theme] ?? THEMES.socket) : theme
}

/**
 * Wrap an inquirer prompt with spinner handling, theme injection, and signal
 * injection. Automatically stops/starts spinners during prompt display, injects
 * the current theme, and injects abort signals. Trims string results and
 * handles cancellation gracefully.
 *
 * @example
 *   const myPrompt = wrapPrompt(rawInquirerPrompt)
 *   const result = await myPrompt({ message: 'Enter name:' })
 *
 * @template T - Type of the prompt result.
 *
 * @param inquirerPrompt - The inquirer prompt function to wrap.
 *
 * @returns Wrapped prompt function with spinner, theme, and signal handling
 */
export function wrapPrompt<T = unknown>(
  inquirerPrompt: (...args: unknown[]) => Promise<T>,
): (...args: unknown[]) => Promise<T | undefined> {
  return async (...args) => {
    const origContext = (args.length > 1 ? args[1] : undefined) as
      | Context
      | undefined
    const { spinner: contextSpinner, ...contextWithoutSpinner } =
      origContext ?? ({} as Context)
    // Lazily acquire the default spinner at call time rather than capturing it
    // at module-eval. Constructing it at import time pins a native handle into
    // the module, which aborts V8 --build-snapshot of anything that
    // transitively imports this module. An explicit context spinner still wins.
    const spinnerInstance =
      contextSpinner !== undefined ? contextSpinner : getDefaultSpinner()
    const signal = getAbortSignal()

    // Inject theme into config (args[0])
    const config = args[0] as Record<string, unknown>
    if (config && typeof config === 'object') {
      if (!config['theme']) {
        // No theme provided, use current theme
        config['theme'] = createInquirerTheme(getTheme())
      } else {
        // Theme provided - let createInquirerTheme handle detection
        config['theme'] = createInquirerTheme(config['theme'])
      }
    }

    // Inject signal into context (args[1])
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

/**
 * Prompt to select multiple items from a list of choices. Wrapped with spinner
 * handling and abort signal support.
 *
 * @example
 *   const choices = await checkbox({
 *     message: 'Select options:',
 *     choices: [
 *       { name: 'Option 1', value: 'opt1' },
 *       { name: 'Option 2', value: 'opt2' },
 *       { name: 'Option 3', value: 'opt3' },
 *     ],
 *   })
 */
// The vendored @inquirer prompts are required LAZILY, inline inside each
// wrapper, never imported at module scope. Requiring any @inquirer bundle
// evaluates @inquirer/core's hook engine, which constructs an AsyncLocalStorage
// singleton — a live native handle that aborts V8 `node --build-snapshot` of
// every module that transitively imports this one (guarded by
// test/unit/snapshot-safety.test.mts). The raw prompt is only needed when the
// prompt actually runs, so deferring the require keeps this module
// snapshot-clean; each specifier stays a string literal so the build still
// vendors it (the same `require('../external/...')` idiom the versions/* leaves
// use to defer the native-handle-bearing semver bundle).
export const checkbox = wrapPrompt((...args: unknown[]) =>
  require('../external/@inquirer/checkbox').default(...args),
) as CheckboxPrompt

/**
 * Prompt for a yes/no confirmation. Wrapped with spinner handling and abort
 * signal support.
 *
 * @example
 *   const answer = await confirm({ message: 'Continue?' })
 *   if (answer) { // user confirmed }
 */
export const confirm = wrapPrompt((...args: unknown[]) =>
  require('../external/@inquirer/confirm').default(...args),
) as ConfirmPrompt

/**
 * Prompt for text input. Wrapped with spinner handling and abort signal
 * support. Result is automatically trimmed.
 *
 * @example
 *   const name = await input({ message: 'Enter your name:' })
 */
export const input = wrapPrompt((...args: unknown[]) =>
  require('../external/@inquirer/input').default(...args),
) as InputPrompt

/**
 * Prompt for password input (hidden characters). Wrapped with spinner handling
 * and abort signal support.
 *
 * @example
 *   const token = await password({ message: 'Enter API token:' })
 */
export const password = wrapPrompt((...args: unknown[]) =>
  require('../external/@inquirer/password').default(...args),
) as PasswordPrompt

/**
 * Prompt with searchable/filterable choices. Wrapped with spinner handling and
 * abort signal support.
 *
 * @example
 *   const result = await search({
 *     message: 'Select a package:',
 *     source: async input => fetchPackages(input),
 *   })
 */
export const search = wrapPrompt((...args: unknown[]) =>
  require('../external/@inquirer/search').default(...args),
) as SearchPrompt

/**
 * Prompt to select from a list of choices. Wrapped with spinner handling and
 * abort signal support.
 *
 * @example
 *   const choice = await select({
 *     message: 'Choose an option:',
 *     choices: [
 *       { name: 'Option 1', value: 'opt1' },
 *       { name: 'Option 2', value: 'opt2' },
 *     ],
 *   })
 */
export const select = wrapPrompt((...args: unknown[]) =>
  require('../external/@inquirer/select').default(...args),
) as SelectPrompt

// Lazy value export (snapshot-safety, see the note above): front the real
// @inquirer Separator class with a Proxy so the vendored-bundle require is
// deferred until the class is constructed or a static is read — importing this
// module never evaluates @inquirer.
export const Separator = new Proxy(
  function () {} as unknown as typeof SeparatorType,
  {
    construct(_target, args) {
      return Reflect.construct(
        require('../external/@inquirer/select').Separator,
        args,
      )
    },
    get(_target, prop, receiver) {
      return Reflect.get(
        require('../external/@inquirer/select').Separator,
        prop,
        receiver,
      )
    },
  },
)
