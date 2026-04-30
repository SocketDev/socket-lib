/**
 * @fileoverview Universal schema validator — non-throwing.
 *
 * Accepts any Zod-shaped schema (`.safeParse`-exposing) and returns a tagged
 * result `{ ok: true, value } | { ok: false, errors }` with normalized
 * `{ path, message }` issues. No runtime dependency on `zod` — detection
 * is purely structural.
 *
 * @internal
 * socket-lib additionally recognizes TypeBox schemas for its own internal
 * use (e.g. `src/ipc.ts`'s stub-file validation). That path is not a
 * supported consumer API.
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 * import { validateSchema } from '@socketsecurity/lib/schema/validate'
 *
 * const User = z.object({ name: z.string() })
 * const r = validateSchema(User, data)
 * if (r.ok) r.value.name // string
 * else r.errors           // ValidationIssue[]
 * ```
 */

import {
  ArrayIsArray,
  NumberIsInteger,
  ObjectGetOwnPropertySymbols,
  TypeErrorCtor,
} from '../primordials'

import type {
  Infer,
  ParseResult,
  ValidateResult,
  ValidationIssue,
} from './types'

/**
 * Detect a TypeBox schema structurally: object with a symbol key whose
 * description is `'TypeBox.Kind'`, holding a string value.
 *
 * @internal
 */
function isTypeBoxSchema(schema: unknown): boolean {
  if (schema === null || typeof schema !== 'object') {
    return false
  }
  for (const sym of ObjectGetOwnPropertySymbols(schema)) {
    if (sym.description === 'TypeBox.Kind') {
      return typeof (schema as Record<symbol, unknown>)[sym] === 'string'
    }
  }
  return false
}

/**
 * Normalize a TypeBox `ValueError` iterator into plain issues.
 * TypeBox paths are JSON Pointers (`/user/0/name`); convert to arrays.
 *
 * @internal
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
        return NumberIsInteger(n) && String(n) === s ? n : s
      }),
      message: err.message,
    })
  }
  return out
}

/**
 * Normalize a Zod error object (v3 or v4) into plain issues.
 * Both versions expose `.issues: Array<{ path, message }>`.
 *
 * @internal
 */
function normalizeZodError(err: unknown): ValidationIssue[] {
  if (err === null || typeof err !== 'object') {
    return [{ path: [], message: String(err) }]
  }
  const issues = (err as { issues?: unknown }).issues
  if (!ArrayIsArray(issues)) {
    return [{ path: [], message: 'Unknown validation error' }]
  }
  return issues.map(issue => {
    const i = issue as {
      path?: Array<string | number>
      message?: string
    }
    return {
      path: ArrayIsArray(i.path) ? i.path : [],
      message: typeof i.message === 'string' ? i.message : 'Invalid value',
    }
  })
}

/**
 * Validate `data` against a Zod-style `schema`. Non-throwing.
 *
 * The return type narrows `value` to `Infer<S>`, so callers get
 * `z.infer<typeof S>` with no casts. Errors are normalized to
 * `{ path, message }` regardless of the underlying validator.
 *
 * @throws {TypeError} When `schema` is not a recognized validator kind.
 */
export function validateSchema<S>(
  schema: S,
  data: unknown,
): ValidateResult<Infer<S>> {
  // Internal TypeBox path: socket-lib uses TypeBox schemas in a few
  // places (e.g. src/ipc.ts), detected here via the structural
  // `[Kind]: string` marker. Not a supported consumer API. The runtime
  // is loaded lazily from the bundled external under `src/external/`.
  if (isTypeBoxSchema(schema)) {
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
        safeParse(
          data: unknown,
        ):
          | ParseResult<unknown>
          | { success: true; data: unknown }
          | { success: false; error: unknown }
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

  throw new TypeErrorCtor(
    'validateSchema: unsupported schema kind. Expected a Zod schema or ' +
      'an object with a safeParse method.',
  )
}
