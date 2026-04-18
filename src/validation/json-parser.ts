/**
 * @fileoverview Safe JSON parsing with validation and security controls.
 * Provides protection against prototype pollution, size limits, and schema
 * validation.
 *
 * Key Features:
 * - Prototype pollution protection: Blocks `__proto__`, `constructor`, and
 *   `prototype` keys via JSON.parse reviver at any depth.
 * - Size limits: Configurable maximum JSON string size (default 10MB).
 * - Schema validation: Optional Zod-compatible schema validation.
 * - Memory safety: Prevents memory exhaustion attacks.
 */

import type { SafeJsonParseOptions, Schema } from './types'

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * JSON.parse reviver that rejects prototype pollution keys at any depth.
 */
function prototypePollutionReviver(key: string, value: unknown): unknown {
  if (DANGEROUS_KEYS.has(key)) {
    throw new Error(
      'JSON contains potentially malicious prototype pollution keys',
    )
  }
  return value
}

/**
 * Safely parse JSON with optional schema validation and security controls.
 * Throws errors on parse failures, validation failures, or security violations.
 *
 * This is the recommended method for parsing untrusted JSON input as it
 * provides multiple layers of security including prototype pollution
 * protection and size limits.
 *
 * @template T - The expected type of the parsed data
 * @param jsonString - The JSON string to parse
 * @param schema - Optional Zod-compatible schema for validation
 * @param options - Parsing options for security and behavior control
 * @returns The parsed and validated data
 *
 * @throws {Error} When JSON string exceeds `maxSize`.
 * @throws {Error} When JSON parsing fails.
 * @throws {Error} When prototype pollution keys are detected (unless
 *   `allowPrototype` is `true`).
 * @throws {Error} When schema validation fails.
 *
 * @example
 * ```ts
 * // Basic parsing with type inference
 * const data = safeJsonParse<User>('{"name":"Alice","age":30}')
 *
 * // With schema validation
 * import { z } from 'zod'
 * const userSchema = z.object({
 *   name: z.string(),
 *   age: z.number()
 * })
 * const user = safeJsonParse('{"name":"Alice","age":30}', userSchema)
 *
 * // With size limit
 * const data = safeJsonParse(jsonString, undefined, {
 *   maxSize: 1024 * 1024 // 1MB
 * })
 *
 * // Allow prototype keys (DANGEROUS — only for trusted sources)
 * const data = safeJsonParse('{"__proto__": {}}', undefined, {
 *   allowPrototype: true
 * })
 * ```
 */
export function safeJsonParse<T = unknown>(
  jsonString: string,
  schema?: Schema<T> | undefined,
  options: SafeJsonParseOptions = {},
): T {
  const { allowPrototype = false, maxSize = 10 * 1024 * 1024 } = options

  // Check size limit.
  const byteLength = Buffer.byteLength(jsonString, 'utf8')
  if (byteLength > maxSize) {
    throw new Error(
      `JSON string exceeds maximum size limit${maxSize !== 10 * 1024 * 1024 ? ` of ${maxSize} bytes` : ''}`,
    )
  }

  // Parse JSON (reviver checks prototype pollution keys at all depths).
  let parsed: unknown
  try {
    parsed = allowPrototype
      ? JSON.parse(jsonString)
      : JSON.parse(jsonString, prototypePollutionReviver)
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error}`)
  }

  // Validate against schema if provided.
  if (schema) {
    const result = schema.safeParse(parsed)
    if (!result.success) {
      const error = result.error as {
        issues: Array<{ path: Array<string | number>; message: string }>
      }
      const errors = error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')
      throw new Error(`Validation failed: ${errors}`)
    }
    return result.data as T
  }

  return parsed as T
}
