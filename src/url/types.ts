/**
 * @file Public type surface for `url/*` modules — option interfaces consumed by
 *   `createRelativeUrl`, `urlSearchParamsAs*`, and `urlSearchParamsGet*`. Pure
 *   types, no runtime side effects.
 */

export interface AssertSafeHttpUrlOptions {
  // Human-readable subject for the thrown message, e.g. 'OAuth issuer'.
  label?: string | undefined
  // When true, localhost / 127.0.0.1 / ::1 pass instead of being refused —
  // for local-stack development only.
  allowLocalhost?: boolean | undefined
}

export interface CreateRelativeUrlOptions {
  base?: string | undefined
}

export interface UrlSearchParamsAsBooleanOptions {
  defaultValue?: boolean | undefined
}

export interface UrlSearchParamsAsNumberOptions {
  defaultValue?: number | undefined
}

export interface UrlSearchParamsAsStringOptions {
  defaultValue?: string | undefined
}

export interface UrlSearchParamsGetBooleanOptions {
  defaultValue?: boolean | undefined
}
