/**
 * @file Public type surface for `url/*` modules — option interfaces consumed by
 *   `createRelativeUrl`, `urlSearchParamsAs*`, and `urlSearchParamsGet*`. Pure
 *   types, no runtime side effects.
 */

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
