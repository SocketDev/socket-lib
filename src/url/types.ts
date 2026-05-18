/**
 * @file Public type surface for `url/*` modules — option interfaces consumed by
 *   `createRelativeUrl`, `urlSearchParamsAs*`, and `urlSearchParamsGet*`. Pure
 *   types, no runtime side effects.
 */

export interface CreateRelativeUrlOptions {
  base?: string
}

export interface UrlSearchParamsAsBooleanOptions {
  defaultValue?: boolean
}

export interface UrlSearchParamsAsNumberOptions {
  defaultValue?: number
}

export interface UrlSearchParamsAsStringOptions {
  defaultValue?: string
}

export interface UrlSearchParamsGetBooleanOptions {
  defaultValue?: boolean
}
