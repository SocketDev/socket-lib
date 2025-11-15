export interface YoctoColors {
  // Modifiers
  reset: (text: string) => string
  bold: (text: string) => string
  dim: (text: string) => string
  italic: (text: string) => string
  underline: (text: string) => string
  overline: (text: string) => string
  inverse: (text: string) => string
  hidden: (text: string) => string
  strikethrough: (text: string) => string

  // Colors
  black: (text: string) => string
  red: (text: string) => string
  green: (text: string) => string
  yellow: (text: string) => string
  blue: (text: string) => string
  magenta: (text: string) => string
  cyan: (text: string) => string
  white: (text: string) => string
  gray: (text: string) => string
  grey: (text: string) => string

  // Bright colors
  blackBright: (text: string) => string
  redBright: (text: string) => string
  greenBright: (text: string) => string
  yellowBright: (text: string) => string
  blueBright: (text: string) => string
  magentaBright: (text: string) => string
  cyanBright: (text: string) => string
  whiteBright: (text: string) => string

  // Background colors
  bgBlack: (text: string) => string
  bgRed: (text: string) => string
  bgGreen: (text: string) => string
  bgYellow: (text: string) => string
  bgBlue: (text: string) => string
  bgMagenta: (text: string) => string
  bgCyan: (text: string) => string
  bgWhite: (text: string) => string

  // RGB colors
  rgb: (r: number, g: number, b: number) => (text: string) => string
  bgRgb: (r: number, g: number, b: number) => (text: string) => string
}

declare const yoctocolorsCjs: YoctoColors
export default yoctocolorsCjs
