/**
 * @file Self-describing multipliers for durations and byte sizes.
 *   `300_000` at a call site says nothing; `5 * MIN` says five minutes. The
 *   numeric-separator form reads a little better than a bare literal, but it
 *   still leaves the reader to divide, and a wrong divisor is invisible in
 *   review - a timeout meant to be 5 minutes shipped as 5 seconds that way.
 *   Durations are milliseconds, matching every timer API in Node. Sizes are
 *   BINARY (1024-based), matching what `fs.statSync().size` is compared
 *   against in practice; the decimal spellings a registry reports are a
 *   presentation concern, not this file's.
 *   MONTH and YEAR are the calendar-average approximations, and are wrong for
 *   any specific month or year. They exist for coarse budgets and cache TTLs -
 *   "expire this after a month" - never for date arithmetic. Reach for a real
 *   date library the moment a boundary matters.
 */

/**
 * One second, in milliseconds.
 */
export const SEC = 1000

/**
 * One minute, in milliseconds.
 */
export const MIN = 60 * SEC

/**
 * One hour, in milliseconds.
 */
export const HR = 60 * MIN

/**
 * One day, in milliseconds.
 */
export const DAY = 24 * HR

/**
 * One week, in milliseconds.
 */
export const WEEK = 7 * DAY

/**
 * An AVERAGE calendar month (30.44 days), in milliseconds. Approximate by
 * construction - never use it to land on a date.
 */
export const MONTH = Math.round(30.436875 * DAY)

/**
 * An AVERAGE calendar year (365.25 days), in milliseconds. Approximate by
 * construction - never use it to land on a date.
 */
export const YEAR = Math.round(365.25 * DAY)

/**
 * One kibibyte (1024 bytes).
 */
export const KB = 1024

/**
 * One mebibyte.
 */
export const MB = 1024 * KB

/**
 * One gibibyte.
 */
export const GB = 1024 * MB

/**
 * One tebibyte. Included so a size cap on a cache or an artifact store does
 * not have to spell `1024 * GB` inline.
 */
export const TB = 1024 * GB
