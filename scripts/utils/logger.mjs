/**
 * @fileoverview Minimal logger for build scripts that mimics the main logger API.
 * This is used during build when the full logger with external dependencies isn't available yet.
 *
 * Uses colored terminal symbols based on CLAUDE.md requirements:
 * - ✓ Success (green)
 * - ✗ Error (red)
 * - ⚠ Warning (yellow)
 * - ℹ Info (blue)
 */

import colors from 'yoctocolors-cjs'

const isDebug = () => !!process.env.DEBUG

// LOG_SYMBOLS from @socketsecurity/lib/logger
const LOG_SYMBOLS = {
  success: colors.green('✓'),
  error: colors.red('✗'),
  warning: colors.yellow('⚠'),
  info: colors.blue('ℹ'),
}

// Simple logger that mimics the main logger API but uses console directly
export const logger = {
  log(...args) {
    console.log(...args)
    return this
  },

  error(...args) {
    console.error(LOG_SYMBOLS.error, ...args)
    return this
  },

  warn(...args) {
    console.warn(LOG_SYMBOLS.warning, ...args)
    return this
  },

  success(...args) {
    console.log(LOG_SYMBOLS.success, ...args)
    return this
  },

  info(...args) {
    console.log(LOG_SYMBOLS.info, ...args)
    return this
  },

  debug(...args) {
    if (isDebug()) {
      console.log(...args)
    }
    return this
  },

  step(...args) {
    console.log(LOG_SYMBOLS.info, ...args)
    return this
  },

  substep(...args) {
    console.log('  ', ...args)
    return this
  },

  progress(message) {
    console.log(message)
    return this
  },
}
