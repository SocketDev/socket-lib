/**
 * @fileoverview JSON parsing utilities with Buffer detection and BOM stripping.
 * Provides safe JSON parsing with automatic encoding handling, plus
 * `safeJsonParse` for untrusted input (prototype-pollution protection +
 * size limits + optional schema validation).
 */

import { validateSchema } from '../schema/validate'
import { stripBom } from '../strings'
import type { Schema } from '../schema/types'
import type {
  JsonParseOptions,
  JsonPrimitive,
  JsonValue,
  SafeJsonParseOptions,
} from './types'

// IMPORTANT: Do not use destructuring here - use direct assignment instead.
// tsgo has a bug that incorrectly transpiles destructured exports, resulting in
// `exports.SomeName = void 0;` which causes runtime errors.
// See: https://github.com/SocketDev/socket-packageurl-js/issues/3
const JSONParse = JSON.parse

/**
 * Check if a value is a Buffer instance.
 * Uses duck-typing to detect Buffer without requiring Node.js Buffer in type system.
 *
 * @param x - Value to check
 * @returns `true` if value is a Buffer, `false` otherwise
 *
 * @example
 * ```ts
 * isBuffer(Buffer.from('hello')) // => true
 * isBuffer('hello') // => false
 * isBuffer({ length: 5 }) // => false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
function isBuffer(x: unknown): x is Buffer {
  if (!x || typeof x !== 'object') {
    return false
  }
  const obj = x as Record<string | number, unknown>
  if (typeof obj['length'] !== 'number') {
    return false
  }
  if (typeof obj['copy'] !== 'function' || typeof obj['slice'] !== 'function') {
    return false
  }
  if (
    typeof obj['length'] === 'number' &&
    obj['length'] > 0 &&
    typeof obj[0] !== 'number'
  ) {
    return false
  }

  const Ctor = (x as { constructor?: unknown }).constructor as
    | { isBuffer?: unknown }
    | undefined
  return !!(typeof Ctor?.isBuffer === 'function' && Ctor.isBuffer(x))
}

/**
 * Check if a value is a JSON primitive type.
 * JSON primitives are: `null`, `boolean`, `number`, or `string`.
 *
 * @param value - Value to check
 * @returns `true` if value is a JSON primitive, `false` otherwise
 *
 * @example
 * ```ts
 * isJsonPrimitive(null) // => true
 * isJsonPrimitive(true) // => true
 * isJsonPrimitive(42) // => true
 * isJsonPrimitive('hello') // => true
 * isJsonPrimitive({}) // => false
 * isJsonPrimitive([]) // => false
 * isJsonPrimitive(undefined) // => false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  )
}

/**
 * Parse JSON content with automatic Buffer handling and BOM stripping.
 * Provides safer JSON parsing with helpful error messages and optional error suppression.
 *
 * Features:
 * - Automatic UTF-8 Buffer conversion
 * - BOM (Byte Order Mark) stripping for cross-platform compatibility
 * - Enhanced error messages with filepath context
 * - Optional error suppression (returns `undefined` instead of throwing)
 * - Optional reviver for transforming parsed values
 *
 * @param content - JSON string or Buffer to parse
 * @param options - Optional parsing configuration
 * @returns Parsed JSON value, or `undefined` if parsing fails and `throws` is `false`
 *
 * @throws {SyntaxError} When JSON is invalid and `throws` is `true` (default)
 *
 * @example
 * ```ts
 * // Basic usage
 * const data = jsonParse('{"name":"example"}')
 * console.log(data.name) // => 'example'
 *
 * // Parse Buffer with UTF-8 BOM
 * const buffer = Buffer.from('\uFEFF{"value":42}')
 * const data = jsonParse(buffer)
 * console.log(data.value) // => 42
 *
 * // Enhanced error messages with filepath
 * try {
 *   jsonParse('invalid', { filepath: 'config.json' })
 * } catch (e) {
 *   console.error(e.message)
 *   // => "config.json: Unexpected token i in JSON at position 0"
 * }
 *
 * // Suppress errors
 * const result = jsonParse('invalid', { throws: false })
 * console.log(result) // => undefined
 *
 * // Transform values with reviver
 * const json = '{"created":"2024-01-15T10:30:00Z"}'
 * const data = jsonParse(json, {
 *   reviver: (key, value) => {
 *     if (key === 'created' && typeof value === 'string') {
 *       return new Date(value)
 *     }
 *     return value
 *   }
 * })
 * console.log(data.created instanceof Date) // => true
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function jsonParse(
  content: string | Buffer,
  options?: JsonParseOptions | undefined,
): JsonValue | undefined {
  const { filepath, reviver, throws } = {
    __proto__: null,
    ...options,
  } as JsonParseOptions
  const shouldThrow = throws === undefined || !!throws
  const jsonStr = isBuffer(content) ? content.toString('utf8') : content
  try {
    return JSONParse(stripBom(jsonStr), reviver)
  } catch (e) {
    if (shouldThrow) {
      const error = e as Error
      if (error && typeof filepath === 'string') {
        error.message = `${filepath}: ${error.message}`
      }
      throw error
    }
  }
  return undefined
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * JSON.parse reviver that rejects prototype pollution keys at any depth.
 *
 * @internal
 */
function prototypePollutionReviver(key: string, value: unknown): unknown {
  if (DANGEROUS_KEYS.has(key)) {
    throw new Error(
      'JSON contains potentially malicious prototype pollution keys',
    )
  }
  return value
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024

/**
 * Safely parse JSON with optional schema validation and security controls.
 * Throws on parse failure, validation failure, or security violation.
 *
 * Recommended for parsing untrusted JSON (user input, network payloads,
 * anything beyond a trust boundary). Layers:
 * 1. Size cap (default 10 MB) prevents memory exhaustion.
 * 2. Prototype-pollution reviver rejects `__proto__` / `constructor` /
 *    `prototype` keys at any depth (unless `allowPrototype: true`).
 * 3. Optional Zod-shaped schema validation via
 *    `@socketsecurity/lib/schema/validate`.
 *
 * For trusted-source reads (package.json, local config files), prefer
 * `jsonParse()` — it offers Buffer/BOM handling and filepath-aware error
 * messages, without the untrusted-input overhead.
 *
 * @throws {Error} When `jsonString` exceeds `maxSize`.
 * @throws {Error} When JSON parsing fails.
 * @throws {Error} When prototype-pollution keys are detected (and
 *   `allowPrototype` is not `true`).
 * @throws {Error} When schema validation fails.
 *
 * @example
 * ```ts
 * // Basic parsing with type inference.
 * const data = safeJsonParse<User>('{"name":"Alice","age":30}')
 *
 * // With schema validation.
 * import { z } from 'zod'
 * const userSchema = z.object({ name: z.string(), age: z.number() })
 * const user = safeJsonParse('{"name":"Alice","age":30}', userSchema)
 *
 * // With size limit.
 * const data = safeJsonParse(jsonString, undefined, { maxSize: 1024 })
 *
 * // Allow prototype keys (DANGEROUS — only for trusted sources).
 * const data = safeJsonParse('{"__proto__":{}}', undefined, {
 *   allowPrototype: true,
 * })
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function safeJsonParse<T = unknown>(
  jsonString: string,
  schema?: Schema<T> | undefined,
  options: SafeJsonParseOptions = {},
): T {
  const { allowPrototype = false, maxSize = DEFAULT_MAX_SIZE } = options

  // Size check up front.
  const byteLength = Buffer.byteLength(jsonString, 'utf8')
  if (byteLength > maxSize) {
    throw new Error(
      `JSON string exceeds maximum size limit${
        maxSize !== DEFAULT_MAX_SIZE ? ` of ${maxSize} bytes` : ''
      }`,
    )
  }

  // Parse with the prototype-pollution reviver unless the caller opted out.
  let parsed: unknown
  try {
    parsed = allowPrototype
      ? JSONParse(jsonString)
      : JSONParse(jsonString, prototypePollutionReviver)
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e}`)
  }

  // Optional schema validation — route through validateSchema so the
  // normalization logic lives in exactly one place.
  if (schema) {
    const result = validateSchema(schema, parsed)
    if (!result.ok) {
      const summary = result.errors
        .map(e => `${e.path.join('.') || '(root)'}: ${e.message}`)
        .join(', ')
      throw new Error(`Validation failed: ${summary}`)
    }
    return result.value
  }

  return parsed as T
}
