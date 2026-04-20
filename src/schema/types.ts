/**
 * @fileoverview Shared types for schema validation.
 *
 * `Schema<T>` is the Zod-shaped duck-type contract — any validator with
 * a `.safeParse(data)` method returning `{ success, data?, error? }`
 * satisfies it. socket-lib detects Zod (v3 and v4) structurally via this
 * interface; consumers bring their own Zod.
 *
 * `ValidateResult<T>` / `ValidationIssue` / `Infer<S>` / `AnySchema` are
 * the normalized shapes produced by `@socketsecurity/lib/schema/validate`
 * and `@socketsecurity/lib/schema/parse`.
 */

/**
 * Result of a Zod-shaped schema's `.safeParse()` call.
 *
 * @template T - The expected type of the parsed data
 */
export interface ParseResult<T> {
  /** Indicates whether parsing was successful */
  success: boolean
  /** Parsed and validated data (only present when `success` is `true`) */
  data?: T | undefined
  /** Error information (only present when `success` is `false`) */
  error?: unknown
}

/**
 * Zod-shaped duck-type for any validator exposing `safeParse` / `parse`.
 *
 * @template T - The expected output type after validation
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 *
 * const userSchema = z.object({ name: z.string(), age: z.number() })
 *
 * // Schema satisfies this interface
 * const schema: Schema<User> = userSchema
 * const result = schema.safeParse({ name: 'Alice', age: 30 })
 * ```
 */
export interface Schema<T = unknown> {
  /** Non-throwing parse. */
  safeParse(data: unknown): ParseResult<T>
  /** Throwing parse. */
  parse(data: unknown): T
  /** Optional schema name for debugging. */
  _name?: string | undefined
}

/**
 * Internal structural shape of a Zod v4 schema — carries the inferred
 * output type on `_zod.output`. Used for type-only detection in `Infer<S>`.
 *
 * @internal
 */
interface ZodV4LikeSchema<O = unknown> {
  _zod: { output: O }
  safeParse(data: unknown): unknown
}

/**
 * Internal structural shape of a Zod v3 schema — carries the inferred
 * output type on `_output`. Used for type-only detection in `Infer<S>`.
 *
 * @internal
 */
interface ZodV3LikeSchema<O = unknown> {
  _output: O
  safeParse(data: unknown): unknown
}

/**
 * Internal structural shape of a TypeBox `TSchema` — carries the inferred
 * output type on the phantom `static` field. Only used inside socket-lib
 * for type-only detection in `Infer<S>`; external callers should pass
 * Zod schemas.
 *
 * @internal
 */
interface TypeBoxLikeSchema {
  static: unknown
}

/**
 * Any schema kind the validators accept.
 */
export type AnySchema =
  | ZodV4LikeSchema<unknown>
  | ZodV3LikeSchema<unknown>
  | TypeBoxLikeSchema
  | Schema<unknown>

/**
 * Infer the validated output type from any supported schema kind.
 *
 * Order matters: TypeBox schemas carry a phantom `static` field, so we
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
 */
export interface ValidationIssue {
  /** Array path into the value (e.g. `['user', 'age']`). */
  path: Array<string | number>
  /** Human-readable description of the failure. */
  message: string
}

/**
 * Tagged-union result of `validateSchema`. Callers narrow on `ok`.
 */
export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationIssue[] }
