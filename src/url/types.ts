/**
 * @fileoverview Public type surface for `url/*` modules — option
 * interfaces consumed by `createRelativeUrl`, `urlSearchParamAs*`,
 * and `urlSearchParamsGet*`. Pure types, no runtime side effects.
 */

export interface CreateRelativeUrlOptions {
  base?: string
}

export interface UrlSearchParamAsBooleanOptions {
  defaultValue?: boolean
}

export interface UrlSearchParamAsNumberOptions {
  defaultValue?: number
}

export interface UrlSearchParamAsStringOptions {
  defaultValue?: string
}

export interface UrlSearchParamsGetBooleanOptions {
  defaultValue?: boolean
}
