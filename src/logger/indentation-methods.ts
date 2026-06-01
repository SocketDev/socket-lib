/**
 * @file Free-function bodies for the `Logger` indentation-domain methods
 *   (`indent`, `dedent`, `resetIndent`, `group`, `groupCollapsed`, `groupEnd`).
 *   Indentation is tracked at the prefix layer (a per-stream string of spaces)
 *   rather than via `node:console`'s frozen `Symbol(kGroupIndent)`, so these
 *   helpers read and write that prefix through a small accessor context handed
 *   in by the calling `Logger`. Pulling these out of `./node` keeps the
 *   `Logger` class body under the file-size cap; the class retains one-line
 *   delegators that build the context from its private state.
 */

import { MathMin } from '../primordials/math'
import { ReflectApply } from '../primordials/reflect'

import { maxIndentation } from './_internal'
import {
  getKGroupIndentationWidthSymbol,
  incLogCallCountSymbol,
  lastWasBlankSymbol,
} from './symbols'

import type { LoggerTrackable } from './console-methods'

/**
 * The slice of `Logger` the indentation helpers need: the bound-stream marker
 * (`undefined` on the root logger, `'stderr'` / `'stdout'` on a stream-bound
 * instance) plus per-stream indent prefix read / write accessors. Modeled
 * structurally to avoid a circular import with `./node`; the class supplies
 * closures over its private `#getIndent` / `#setIndent`.
 */
export interface IndentContext {
  boundStream: 'stderr' | 'stdout' | undefined
  getIndent(stream: 'stderr' | 'stdout'): string
  setIndent(stream: 'stderr' | 'stdout', value: string): void
}

/**
 * Decrease the indentation prefix by `spaces`.
 *
 * On the root logger (`boundStream` undefined) both streams shrink; on a
 * stream-bound logger only the bound stream shrinks. Returns the logger for
 * chaining.
 *
 * @param logger - The calling logger instance.
 * @param ctx - The logger's indentation accessor context.
 * @param spaces - Number of spaces to remove (default 2).
 */
export function dedentMethod<T extends LoggerTrackable>(
  logger: T,
  ctx: IndentContext,
  spaces: number,
): T {
  if (ctx.boundStream) {
    const current = ctx.getIndent(ctx.boundStream)
    ctx.setIndent(ctx.boundStream, current.slice(0, -spaces))
  } else {
    const stderrCurrent = ctx.getIndent('stderr')
    const stdoutCurrent = ctx.getIndent('stdout')
    ctx.setIndent('stderr', stderrCurrent.slice(0, -spaces))
    ctx.setIndent('stdout', stdoutCurrent.slice(0, -spaces))
  }
  return logger
}

/**
 * End the current log group and decrease indentation by the group-indent width.
 *
 * Call once per `groupMethod` / `groupCollapsed`. Returns the logger for
 * chaining.
 *
 * @param logger - The calling logger instance.
 */
export function groupEndMethod<T extends { dedent(spaces?: number): T }>(
  logger: T,
): T {
  logger.dedent(
    (logger as unknown as Record<symbol, number | undefined>)[
      getKGroupIndentationWidthSymbol()
    ],
  )
  return logger
}

/**
 * Start a new indented log group.
 *
 * A provided label is logged via the logger's own `log` before indentation
 * increases by the group-indent width (default 2). Groups nest; close with
 * `groupEndMethod`. Returns the logger for chaining.
 *
 * @param logger - The calling logger instance.
 * @param label - Optional label to display before the group.
 */
export function groupMethod<
  T extends LoggerTrackable & {
    indent(spaces?: number): T
    log(...args: unknown[]): T
  },
>(logger: T, label: unknown[]): T {
  const { length } = label
  if (length) {
    ReflectApply(logger.log, logger, label)
  }
  logger.indent(
    (logger as unknown as Record<symbol, number | undefined>)[
      getKGroupIndentationWidthSymbol()
    ],
  )
  if (length) {
    logger[lastWasBlankSymbol](false)
    logger[incLogCallCountSymbol]()
  }
  return logger
}

/**
 * Increase the indentation prefix by `spaces`, capped at `maxIndentation`.
 *
 * On the root logger both streams grow; on a stream-bound logger only the bound
 * stream grows. Returns the logger for chaining.
 *
 * @param logger - The calling logger instance.
 * @param ctx - The logger's indentation accessor context.
 * @param spaces - Number of spaces to add (default 2).
 */
export function indentMethod<T extends LoggerTrackable>(
  logger: T,
  ctx: IndentContext,
  spaces: number,
): T {
  const spacesToAdd = ' '.repeat(MathMin(spaces, maxIndentation))
  if (ctx.boundStream) {
    const current = ctx.getIndent(ctx.boundStream)
    ctx.setIndent(ctx.boundStream, current + spacesToAdd)
  } else {
    const stderrCurrent = ctx.getIndent('stderr')
    const stdoutCurrent = ctx.getIndent('stdout')
    ctx.setIndent('stderr', stderrCurrent + spacesToAdd)
    ctx.setIndent('stdout', stdoutCurrent + spacesToAdd)
  }
  return logger
}

/**
 * Reset all indentation to zero.
 *
 * On the root logger both streams reset; on a stream-bound logger only the
 * bound stream resets. Returns the logger for chaining.
 *
 * @param logger - The calling logger instance.
 * @param ctx - The logger's indentation accessor context.
 */
export function resetIndentMethod<T extends LoggerTrackable>(
  logger: T,
  ctx: IndentContext,
): T {
  if (ctx.boundStream) {
    ctx.setIndent(ctx.boundStream, '')
  } else {
    ctx.setIndent('stderr', '')
    ctx.setIndent('stdout', '')
  }
  return logger
}
