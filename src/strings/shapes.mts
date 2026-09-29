/**
 * @file Compile-time string shape types — non-empty and exact-length string
 *   constraints built from template literal types. Pure types, no runtime
 *   side effects, and NO branded types or `any`: every type here is an
 *   ordinary string type that plain literals satisfy or fail structurally.
 *   The trick is template literal slots. A slot of `string & {}` accepts any
 *   one character but not the empty string (the `{}` intersection drops the
 *   empty literal from `string`), a slot of `` bigint & {} `` accepts exactly
 *   one digit, and a final slot of `'' & String` (the `String` interface keeps
 *   the intersection from collapsing back to `string`) pins the template to
 *   that exact end — so slot counts become length constraints.
 */

/**
 * A template-literal end marker that matches only the empty string. Placed as
 * the final slot of a template type, it pins the match to that exact length.
 *
 * The `String` interface is load-bearing, NOT a wrapper-object mistake:
 * intersecting with it keeps TS from normalizing this to the literal `''`,
 * which a template slot would then collapse away — `'' & string` as the last
 * slot matches ANY length, silently un-pinning every shape that uses it.
 */
// oxlint-disable-next-line typescript/no-wrapper-object-types -- the String intersection is what pins the slot.
export type End = "" & String;

/**
 * A template-literal slot matching exactly one character. Never use it as a
 * standalone type: as a bare type it is just `string`.
 */
export type Char = string & {};

/**
 * A template-literal slot matching exactly one digit (`0`-`9`). Never use it
 * as a standalone type: as a bare type it is just `` bigint ``.
 */
export type Digit = bigint & {};

/**
 * Any string except the empty string.
 *
 * @example
 *   const ok: NonEmpty = 'x'
 *   // @ts-expect-error — the empty string is rejected.
 *   const bad: NonEmpty = ''
 */
export type NonEmpty = `${Char}${string}`;

/**
 * A string of exactly `Length` characters. `Length` is bounded by the
 * compiler's conditional-type recursion limit, so keep it small (well under
 * 50).
 *
 * @example
 *   type CountryCode = ExactChars<3> // exactly 3 characters
 */
export type ExactChars<Length extends number> = ExactOf<Length, Char>;

/**
 * A string of exactly `Length` digits (`0`-`9`). `Length` is bounded by the
 * compiler's conditional-type recursion limit, so keep it small (well under
 * 50).
 *
 * @example
 *   type PinCode = ExactDigits<4> // exactly 4 digits
 */
export type ExactDigits<Length extends number> = ExactOf<Length, `${Digit}`>;

/**
 * Recursive builder behind {@link ExactChars} and {@link ExactDigits}.
 */
export type ExactOf<
  Length extends number,
  Slot extends string,
  Count extends unknown[] = [],
> = Count["length"] extends Length
  ? End
  : `${Slot}${ExactOf<Length, Slot, [unknown, ...Count]>}`;
