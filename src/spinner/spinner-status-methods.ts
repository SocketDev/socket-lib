/**
 * @file Status-presentation methods for the Socket `Spinner` class, split out
 *   of `create-spinner-class.ts` to keep that module under the file-size cap.
 *   Each method is a thin delegation to one of the two internal helpers the
 *   class exposes via well-known symbols (`applyStatusSymbol`,
 *   `showStatusSymbol`); `installStatusMethods()` defines them on the spinner
 *   prototype after the class is built so they share the same private state.
 */

import { isDebug } from '../debug/namespace'
import { LOG_SYMBOLS } from '../logger/symbols'

import { normalizeText } from './format'

import type { SpinnerLogger } from './create-spinner-class'
import type { SpinnerInstance, SymbolType } from './types'

/**
 * Well-known symbol the spinner class uses to expose its `#apply` helper so the
 * status methods in this module can drive a yocto-spinner method + logger
 * update without reaching into a private field across the file boundary.
 */
export const applyStatusSymbol: unique symbol = Symbol.for(
  'socket.spinner.applyStatus',
)

/**
 * Well-known symbol the spinner class uses to expose its
 * `#showStatusAndKeepSpinning` helper so the status methods here can emit a
 * symbol-prefixed status line without stopping the spinner.
 */
export const showStatusSymbol: unique symbol = Symbol.for(
  'socket.spinner.showStatus',
)

/**
 * Runtime shape of the spinner instance the status methods operate on. Only the
 * two symbol-keyed helpers are needed; everything else is reached through the
 * module-scope `logger`.
 */
export type StatusHost = SpinnerInstance & {
  [applyStatusSymbol]: (methodName: string, args: unknown[]) => SpinnerInstance
  [showStatusSymbol]: (
    symbolType: SymbolType,
    args: unknown[],
  ) => SpinnerInstance
}

/**
 * Install the status-presentation methods onto the spinner prototype. The
 * methods close over `logger` for the stdout/stderr writes and reach the
 * spinner's private helpers through the two well-known symbols.
 *
 * @param proto - The spinner class prototype to augment.
 * @param logger - Default logger used for status output.
 */
export function installStatusMethods(
  proto: object,
  logger: SpinnerLogger,
): void {
  const target = proto as Record<string, unknown>

  function debug(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    if (isDebug()) {
      return this[showStatusSymbol]('info', [text, ...extras])
    }
    return this
  }

  function debugAndStop(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    if (isDebug()) {
      return this[applyStatusSymbol]('info', [text, ...extras])
    }
    return this
  }

  function done(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[showStatusSymbol]('success', [text, ...extras])
  }

  function doneAndStop(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[applyStatusSymbol]('success', [text, ...extras])
  }

  function fail(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[showStatusSymbol]('fail', [text, ...extras])
  }

  function failAndStop(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[applyStatusSymbol]('error', [text, ...extras])
  }

  function info(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[showStatusSymbol]('info', [text, ...extras])
  }

  function infoAndStop(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[applyStatusSymbol]('info', [text, ...extras])
  }

  function log(this: StatusHost, ...args: unknown[]): SpinnerInstance {
    logger.log(...args)
    return this
  }

  function logAndStop(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[applyStatusSymbol]('stop', [text, ...extras])
  }

  function skip(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[showStatusSymbol]('skip', [text, ...extras])
  }

  function skipAndStop(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    // Unlike the other *AndStop methods, this cannot route through the apply
    // helper with a 'skip' method name because yocto-spinner has no built-in
    // 'skip' method. Stop the spinner first, then log the skip line.
    this[applyStatusSymbol]('stop', [])
    const normalized = normalizeText(text)
    /* c8 ignore start - empty-text no-op fires when text is undefined or whitespace-only */
    if (normalized) {
      logger.error(`${LOG_SYMBOLS['skip']} ${normalized}`, ...extras)
    }
    return this
    /* c8 ignore stop */
  }

  function step(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    /* c8 ignore start - text-omitted no-op arm fires when caller invokes step() bare */
    if (typeof text === 'string') {
      logger.error('')
      logger.error(text, ...extras)
    }
    return this
    /* c8 ignore stop */
  }

  function substep(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    /* c8 ignore start - text-omitted no-op arm fires when caller invokes substep() bare */
    if (typeof text === 'string') {
      logger.error(`  ${text}`, ...extras)
    }
    return this
    /* c8 ignore stop */
  }

  function success(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[showStatusSymbol]('success', [text, ...extras])
  }

  function successAndStop(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[applyStatusSymbol]('success', [text, ...extras])
  }

  function warn(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[showStatusSymbol]('warn', [text, ...extras])
  }

  function warnAndStop(
    this: StatusHost,
    text?: string | undefined,
    ...extras: unknown[]
  ): SpinnerInstance {
    return this[applyStatusSymbol]('warning', [text, ...extras])
  }

  target['debug'] = debug
  target['debugAndStop'] = debugAndStop
  target['done'] = done
  target['doneAndStop'] = doneAndStop
  target['fail'] = fail
  target['failAndStop'] = failAndStop
  target['info'] = info
  target['infoAndStop'] = infoAndStop
  target['log'] = log
  target['logAndStop'] = logAndStop
  target['skip'] = skip
  target['skipAndStop'] = skipAndStop
  target['step'] = step
  target['substep'] = substep
  target['success'] = success
  target['successAndStop'] = successAndStop
  target['warn'] = warn
  target['warnAndStop'] = warnAndStop
}
