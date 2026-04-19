/**
 * @fileoverview Universal schema validation — works with TypeBox, Zod (v3 and
 * v4), and any Zod-shaped `Schema<T>` duck type.
 *
 * Accepts any supported schema kind and returns a tagged result.
 *   - `{ ok: true, value }`  — validation passed, `value` is typed as the
 *     schema's inferred output.
 *   - `{ ok: false, errors }` — validation failed, `errors` is a normalized
 *     list of `{ path, message }` regardless of which validator produced them.
 *
 * Types flow through: `validateSchema(ZodSchema, data)` returns
 * `{ ok: true, value: z.infer<typeof ZodSchema> } | { ok: false, errors: ... }`.
 * `validateSchema(TypeBoxSchema, data)` returns the equivalent using
 * `Static<typeof TypeBoxSchema>`. Zod is detected purely structurally via
 * `.safeParse` — no runtime import. TypeBox validation lazy-loads the
 * bundled `@sinclair/typebox/value` runtime from `src/external/`.
 */

import type { ParseResult, Schema } from './types'

/**
 * TypeBox's `Kind` symbol. We reference it structurally for schema detection
 * rather than importing it from `@sinclair/typebox` — detection scans the
 * schema's own-symbol keys for one whose description is `'TypeBox.Kind'`.
 * The `Value` runtime is only loaded lazily when a TypeBox schema is seen.
 */
type TypeBoxKindSymbol = symbol & { __typeBoxKindBrand?: never }

/**
 * Structural minimum of a TypeBox `TSchema`. The phantom `static` field is
 * the type TypeBox uses for inference (`Static<T> = T['static']`).
 */
interface TypeBoxLikeSchema {
  [k: TypeBoxKindSymbol]: string
  static: unknown
}

/**
 * Structural shape of a Zod v4 schema — carries output type on `_zod.output`.
 */
interface ZodV4LikeSchema<O = unknown> {
  _zod: { output: O }
  safeParse(data: unknown): unknown
}

/**
 * Structural shape of a Zod v3 schema — carries output type on `_output`.
 */
interface ZodV3LikeSchema<O = unknown> {
  _output: O
  safeParse(data: unknown): unknown
}

/**
 * Any schema kind this helper accepts.
 */
export type AnySchema =
  | TypeBoxLikeSchema
  | ZodV4LikeSchema<unknown>
  | ZodV3LikeSchema<unknown>
  | Schema<unknown>

/**
 * Infer the validated output type from any supported schema kind.
 *
 * Order matters: TypeBox schemas also carry a phantom `static` field, so we
 * check for TypeBox before falling through to Zod and the duck-type.
 */
export type Infer<S> = S extends { static: infer Static }
  ? Static
  : S extends { _zod: { output: infer O } }
    ? O
    : S extends { _output: infer O }
      ? O
      : S extends Schema<infer T>
        ? T
        : unknown

/**
 * A single normalized validation error.
 * - `path` is a dotted or slash-separated identifier locating the bad value.
 * - `message` is human-readable.
 */
export interface ValidationIssue {
  /** Array path into the value (e.g. `['user', 'age']`). */
  path: Array<string | number>
  /** Human-readable description of the failure. */
  message: string
}

/**
 * Tagged-union result of {@link validateSchema}. Callers narrow on `ok`.
 */
export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationIssue[] }

/**
 * Detect a TypeBox schema structurally: object with a symbol key whose
 * description is `'TypeBox.Kind'`, holding a string value (the kind name
 * like `'Object'`, `'Array'`, `'String'`).
 */
function isTypeBoxSchema(schema: unknown): schema is TypeBoxLikeSchema {
  if (schema === null || typeof schema !== 'object') {
    return false
  }
  for (const sym of Object.getOwnPropertySymbols(schema)) {
    if (sym.description === 'TypeBox.Kind') {
      return typeof (schema as Record<symbol, unknown>)[sym] === 'string'
    }
  }
  return false
}

/**
 * Normalize a TypeBox `ValueError` iterator into plain issues.
 * TypeBox paths are JSON Pointers (`/user/0/name`); convert to arrays.
 */
function normalizeTypeBoxErrors(
  errors: Iterable<{ path: string; message: string }>,
): ValidationIssue[] {
  const out: ValidationIssue[] = []
  for (const err of errors) {
    const segs = err.path.split('/').filter(Boolean)
    out.push({
      path: segs.map(s => {
        const n = Number(s)
        return Number.isInteger(n) && String(n) === s ? n : s
      }),
      message: err.message,
    })
  }
  return out
}

/**
 * Normalize a Zod error object (v3 or v4) into plain issues.
 * Both versions expose `.issues: Array<{ path, message }>`.
 */
function normalizeZodError(err: unknown): ValidationIssue[] {
  if (err === null || typeof err !== 'object') {
    return [{ path: [], message: String(err) }]
  }
  const issues = (err as { issues?: unknown }).issues
  if (!Array.isArray(issues)) {
    return [{ path: [], message: 'Unknown validation error' }]
  }
  return issues.map(issue => {
    const i = issue as {
      path?: Array<string | number>
      message?: string
    }
    return {
      path: Array.isArray(i.path) ? i.path : [],
      message: typeof i.message === 'string' ? i.message : 'Invalid value',
    }
  })
}

/**
 * Validate `data` against any supported `schema` kind. Non-throwing.
 *
 * Supported schema kinds:
 * - `@sinclair/typebox` schemas (detected via the `Kind` symbol)
 * - `zod` schemas, v3 and v4 (detected via `.safeParse` on the schema)
 * - Any object conforming to {@link Schema} (the socket-lib duck type)
 *
 * The return type narrows `value` to {@link Infer | `Infer<S>`}, so Zod users
 * get `z.infer<typeof S>` and TypeBox users get `Static<typeof S>` with no
 * casts.
 *
 * @example
 * ```ts
 * // Zod
 * import { z } from 'zod'
 * const U = z.object({ name: z.string() })
 * const r = validateSchema(U, data)
 * if (r.ok) r.value.name // string
 *
 * // TypeBox
 * import { Type } from '@sinclair/typebox'
 * const U = Type.Object({ name: Type.String() })
 * const r = validateSchema(U, data)
 * if (r.ok) r.value.name // string
 * ```
 *
 * Errors are normalized to {@link ValidationIssue}: `{ path, message }`.
 * TypeBox JSON-Pointer paths are converted to arrays. Numeric segments are
 * parsed as numbers.
 */
export function validateSchema<S>(
  schema: S,
  data: unknown,
): ValidateResult<Infer<S>> {
  // TypeBox path: check the structural `[Kind]: string` marker.
  if (isTypeBoxSchema(schema)) {
    // TypeBox's Value runtime is bundled into socket-lib's dist/external,
    // so consumers don't need to install @sinclair/typebox separately —
    // they get Value.Check + Value.Errors from our vendored copy.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Value } = require('../external/@sinclair/typebox/value') as {
      Value: {
        Check(schema: unknown, value: unknown): boolean
        Errors(
          schema: unknown,
          value: unknown,
        ): Iterable<{ path: string; message: string }>
      }
    }
    if (Value.Check(schema, data)) {
      return { ok: true, value: data as Infer<S> }
    }
    return {
      ok: false,
      errors: normalizeTypeBoxErrors(Value.Errors(schema, data)),
    }
  }

  // Zod / Schema<T> duck-type path: any object exposing `.safeParse`.
  if (
    schema !== null &&
    typeof schema === 'object' &&
    typeof (schema as { safeParse?: unknown }).safeParse === 'function'
  ) {
    const result = (
      schema as unknown as {
        safeParse(data: unknown):
          | ParseResult<unknown>
          | {
              success: true
              data: unknown
            }
          | {
              success: false
              error: unknown
            }
      }
    ).safeParse(data)

    if ((result as { success: boolean }).success === true) {
      return {
        ok: true,
        value: (result as { data: unknown }).data as Infer<S>,
      }
    }
    return {
      ok: false,
      errors: normalizeZodError((result as { error: unknown }).error),
    }
  }

  throw new TypeError(
    'validateSchema: unsupported schema kind. Expected a TypeBox schema, ' +
      'a Zod schema, or an object with a safeParse method.',
  )
}

/**
 * Parse `data` against `schema` and return the validated value. Throws if
 * validation fails. This is the throwing twin of {@link validateSchema}.
 *
 * Use when you want fail-fast semantics at a trust boundary. For recoverable
 * validation (form input, external configs), prefer {@link validateSchema}.
 *
 * @throws {Error} When validation fails. The message lists all issues.
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
