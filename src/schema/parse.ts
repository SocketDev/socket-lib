/**
 * @fileoverview Throwing twin of `validateSchema`.
 *
 * Use `parseSchema(schema, data)` for fail-fast trust boundaries (app
 * startup, config files, internal assertions). Use the non-throwing
 * `validateSchema` for recoverable input (form fields, API request bodies,
 * anywhere errors need to surface to a user).
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 * import { parseSchema } from '@socketsecurity/lib/schema/parse'
 *
 * const Config = z.object({ host: z.string(), port: z.number() })
 * const config = parseSchema(Config, json)  // throws on invalid
 * ```
 */

import { validateSchema } from './validate'
import type { Infer } from './types'

/**
 * Parse `data` against `schema` and return the validated value.
 *
 * @throws {Error} When validation fails. The message lists all issues as
 *   `path: message, path: message, ...`. Use `validateSchema` if you need
 *   structured access to the error list.
 */
export function parseSchema<S>(schema: S, data: unknown): Infer<S> {
  const result = validateSchema(schema, data)
  if (result.ok) {
    return result.value
  }
  const summary = result.errors
    .map(e => `${e.path.join('.') || '(root)'}: ${e.message}`)
    .join(', ')
  throw new Error(`Validation failed: ${summary}`)
}
