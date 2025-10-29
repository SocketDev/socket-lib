/**
 * @fileoverview Simplified spinner for build scripts.
 *
 * This is intentionally separate from src/lib/spinner.ts to avoid circular
 * dependencies where build scripts depend on the built dist output.
 */

/**
 * Simple spinner without external dependencies
 */
class SimpleSpinner {
  constructor() {
    this.message = ''
    this.isSpinning = false
  }

  start(message = '') {
    this.message = message
    this.isSpinning = true
    if (message) {
      process.stdout.write(`${message}`)
    }
    return this
  }

  stop() {
    if (this.isSpinning) {
      if (this.message) {
        process.stdout.write('\r\x1b[K')
      }
      this.isSpinning = false
      this.message = ''
    }
    return this
  }

  success(message) {
    this.stop()
    if (message) {
      console.log(`✓ ${message}`)
    }
    return this
  }

  fail(message) {
    this.stop()
    if (message) {
      console.error(`✗ ${message}`)
    }
    return this
  }

  warn(message) {
    this.stop()
    if (message) {
      console.warn(`⚠ ${message}`)
    }
    return this
  }

  info(message) {
    this.stop()
    if (message) {
      console.log(`ℹ ${message}`)
    }
    return this
  }
}

export const spinner = new SimpleSpinner()
