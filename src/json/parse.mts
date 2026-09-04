/**
 * @file JSON parsing utilities with Buffer detection and BOM stripping.
 *   Provides safe JSON parsing with automatic encoding handling, plus
 *   `parseJsonStrict` for untrusted input (prototype-pollution protection +
 *   size limits + optional schema validation).
 */

import { validateSchema } from '../schema/validate.mjs'
import { stripBom } from '../strings/transform.mjs'
import { BufferByteLength } from '../primordials/buffer.mjs'
import { ErrorCtor } from '../primordials/error.mjs'
import { JSONParse } from '../primordials/json.mjs'
import { SetCtor } from '../primordials/map-set.mjs'
import type {
  JsonPrimitive,
  JsonValue,
  ParseJsonOptions,
  ParseJsonStrictOptions,
} from './types.mjs'

/**
 * Check if a value is a Buffer instance. Uses duck-typing to detect Buffer
 * without requiring Node.js Buffer in type system.
 *
 * @example
 *   ;```ts
 *   isBuffer(Buffer.from('hello')) // => true
 *   isBuffer('hello') // => false
 *   isBuffer({ length: 5 }) // => false
 *   ```
 *
 * @param x - Value to check.
 *
 * @returns `true` if value is a Buffer, `false` otherwise
 */
export function isBuffer(x: unknown): x is Buffer {
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

  const Ctor = (x as { constructor?: unknown | undefined }).constructor as
    | { isBuffer?: unknown | undefined }
    | undefined
  return !!(typeof Ctor?.isBuffer === 'function' && Ctor.isBuffer(x))
}

/**
 * Check if a value is a JSON primitive type. JSON primitives are: `null`,
 * `boolean`, `number`, or `string`.
 *
 * @example
 *   ;```ts
 *   isJsonPrimitive(null) // => true
 *   isJsonPrimitive(true) // => true
 *   isJsonPrimitive(42) // => true
 *   isJsonPrimitive('hello') // => true
 *   isJsonPrimitive({}) // => false
 *   isJsonPrimitive([]) // => false
 *   isJsonPrimitive(undefined) // => false
 *   ```
 *
 * @param value - Value to check.
 *
 * @returns `true` if value is a JSON primitive, `false` otherwise
 */
export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  )
}

/**
 * Parse JSON content with automatic Buffer handling and BOM stripping. Provides
 * safer JSON parsing with helpful error messages and optional error
 * suppression.
 *
 * Features: - Automatic UTF-8 Buffer conversion - Byte Order Mark
 * stripping for cross-platform compatibility - Enhanced error messages with
 * filepath context - Optional error suppression (returns `undefined` instead of
 * throwing) - Optional reviver for transforming parsed values.
 *
 * @example
 *   ;```ts
 *   // Basic usage
 *   const data = parseJson('{"name":"example"}')
 *   console.log(data.name) // => 'example'
 *
 *   // Parse Buffer with UTF-8 BOM
 *   const buffer = Buffer.from('\uFEFF{"value":42}')
 *   const data = parseJson(buffer)
 *   console.log(data.value) // => 42
 *
 *   // Enhanced error messages with filepath
 *   try {
 *     parseJson('invalid', { filepath: 'config.json' })
 *   } catch (e) {
 *     console.error(e.message)
 *     // => "config.json: Unexpected token i in JSON at position 0"
 *   }
 *
 *   // Suppress errors
 *   const result = parseJson('invalid', { throws: false })
 *   console.log(result) // => undefined
 *
 *   // Transform values with reviver
 *   const json = '{"created":"2024-01-15T10:30:00Z"}'
 *   const data = parseJson(json, {
 *     reviver: (key, value) => {
 *       if (key === 'created' && typeof value === 'string') {
 *         return new Date(value)
 *       }
 *       return value
 *     },
 *   })
 *   console.log(data.created instanceof Date) // => true
 *   ```
 *
 * @param content - JSON string or Buffer to parse.
 * @param options - Optional parsing configuration.
 *
 * @returns Parsed JSON value, or `undefined` if parsing fails and `throws` is
 *   `false`
 *
 * @throws {SyntaxError} When JSON is invalid and `throws` is `true` (default)
 */
export function parseJson(
  content: string | Buffer,
  options?: ParseJsonOptions | undefined,
): JsonValue | undefined {
  const { filepath, reviver, throws } = {
    __proto__: null,
    ...options,
  } as ParseJsonOptions
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

const DANGEROUS_KEYS = new SetCtor(['__proto__', 'constructor', 'prototype'])
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024

/**
 * Safely parse JSON with optional schema validation and security controls.
 * Throws on parse failure, validation failure, or security violation.
 *
 * Untrusted input only: size cap, prototype-pollution reviver, optional schema.
 * Trusted reads (package.json, local config) want `parseJson()` instead.
 *
 * @throws {Error} On oversize input, parse failure, prototype-pollution keys,
 *   or schema validation failure.
 *
 * @unused No internal or Socket consumers; downstream repos call the plain
 *   `parseJson`. Exercised only by its unit tests.
 */
export function parseJsonStrict<T = unknown>(
  jsonString: string,
  options?: ParseJsonStrictOptions<T> | undefined,
): T {
  const {
    allowPrototype = false,
    maxSize = DEFAULT_MAX_SIZE,
    schema,
  } = {
    __proto__: null,
    ...options,
  } as ParseJsonStrictOptions<T>

  // Size check up front.
  const byteLength = BufferByteLength!(jsonString, 'utf8')
  if (byteLength > maxSize) {
    throw new ErrorCtor(
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
    throw new ErrorCtor(`Failed to parse JSON: ${e}`)
  }

  // Optional schema validation — route through validateSchema so the
  // normalization logic lives in exactly one place.
  if (schema) {
    const result = validateSchema(schema, parsed)
    if (!result.ok) {
      const summary = result.errors
        .map(e => `${e.path.join('.') || '(root)'}: ${e.message}`)
        .join(', ')
      throw new ErrorCtor(`Validation failed: ${summary}`)
    }
    return result.value
  }

  return parsed as T
}

/**
 * JSON.parse reviver that rejects prototype pollution keys at any depth.
 *
 * @internal
 */
export function prototypePollutionReviver(
  key: string,
  value: unknown,
): unknown {
  if (DANGEROUS_KEYS.has(key)) {
    throw new ErrorCtor(
      'JSON contains potentially malicious prototype pollution keys',
    )
  }
  return value
}
