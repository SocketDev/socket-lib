import type {
  ColorInfo,
  ColorSupport,
  ColorSupportLevel,
  Options,
  createSupportsColor as createSupportsColorFn,
  default as supportsColorDefault,
} from 'supports-color'

export type { ColorInfo, ColorSupport, ColorSupportLevel, Options }

/*
 * The shim flattens the upstream module's two levels onto one object: the
 * default export's eager `stdout` / `stderr` results, plus the
 * `createSupportsColor` factory that sits on the namespace beside it. Declared
 * member by member because that flattening has no single upstream type.
 */
export declare const stdout: ColorInfo
export declare const stderr: ColorInfo
export declare const createSupportsColor: typeof createSupportsColorFn

declare const supportsColor: typeof supportsColorDefault
export default supportsColor
