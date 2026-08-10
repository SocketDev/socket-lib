/**
 * @file Lazy cross-runtime resolver for the built-in LanguageModel factory.
 *   Browser runtimes use `globalThis.LanguageModel`; smol Node uses the Prompt
 *   API exported by `node:smol-ai`; stock Node may use the optional
 *   `@node-smol/ai` N-API umbrella package. Resolution never calls
 *   `availability()` or creates a session and never falls back to a hosted
 *   model.
 */

import { isNodeBuiltin, requireBuiltin } from '../node/module'

export type LanguageModelAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'

/**
 * Stable factory seam shared by Chrome and the native Node implementations.
 * The session is intentionally opaque while the Prompt API surface is still
 * changing across browser versions.
 */
export interface LanguageModelFactory {
  availability(
    options?: unknown | undefined,
  ): Promise<LanguageModelAvailability>
  create(options?: unknown | undefined): Promise<unknown>
}

export interface SmolAiModule {
  readonly default?: unknown | undefined
  readonly LanguageModel?: unknown | undefined
}

const ADDON_SPECIFIER = '@node-smol/ai'
const BUILTIN_SPECIFIER = 'node:smol-ai'

let languageModelCache: LanguageModelFactory | undefined
let languageModelProbed = false

/**
 * Resolve the local LanguageModel factory once, in browser → smol builtin →
 * stock-Node addon order. Returns `undefined` when no local implementation is
 * available. A present addon that fails during initialization still throws;
 * only absence of the optional package is treated as unavailable.
 */
export function getLanguageModel(): LanguageModelFactory | undefined {
  if (languageModelProbed) {
    return languageModelCache
  }
  languageModelProbed = true

  const browserFactory = normalizeLanguageModelFactory(
    (
      globalThis as typeof globalThis & {
        readonly LanguageModel?: unknown | undefined
      }
    ).LanguageModel,
  )
  if (browserFactory) {
    languageModelCache = browserFactory
    return languageModelCache
  }

  if (isNodeBuiltin(BUILTIN_SPECIFIER)) {
    const builtinFactory = normalizeLanguageModelFactory(
      requireBuiltin(BUILTIN_SPECIFIER),
    )
    if (builtinFactory) {
      languageModelCache = builtinFactory
      return languageModelCache
    }
  }

  try {
    languageModelCache = normalizeLanguageModelFactory(
      requireBuiltin(ADDON_SPECIFIER),
    )
  } catch (error) {
    if (!isMissingOptionalPackage(error)) {
      throw error
    }
  }
  return languageModelCache
}

export function isLanguageModelFactory(
  value: unknown,
): value is LanguageModelFactory {
  if (
    (typeof value !== 'function' && typeof value !== 'object') ||
    value === null
  ) {
    return false
  }
  const candidate = value as Partial<LanguageModelFactory>
  return (
    typeof candidate.availability === 'function' &&
    typeof candidate.create === 'function'
  )
}

export function isMissingOptionalPackage(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const candidate = error as {
    code?: unknown | undefined
    message?: unknown | undefined
  }
  return (
    candidate.code === 'MODULE_NOT_FOUND' &&
    typeof candidate.message === 'string' &&
    candidate.message.startsWith(`Cannot find module '${ADDON_SPECIFIER}'`)
  )
}

export function normalizeLanguageModelFactory(
  value: unknown,
): LanguageModelFactory | undefined {
  if (isLanguageModelFactory(value)) {
    return value
  }
  if (
    (typeof value !== 'function' && typeof value !== 'object') ||
    value === null
  ) {
    return undefined
  }
  const namespace = value as SmolAiModule
  if (isLanguageModelFactory(namespace.LanguageModel)) {
    return namespace.LanguageModel
  }
  if (isLanguageModelFactory(namespace.default)) {
    return namespace.default
  }
  return undefined
}
