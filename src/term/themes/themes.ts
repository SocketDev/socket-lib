/**
 * @file Elegant theme definitions for Socket libraries. Sophisticated color
 *   palettes crafted for clarity and visual harmony. Philosophy: Every color
 *   choice serves a purpose. Bright variants ensure terminal legibility without
 *   compromising sophistication. Minimal emoji use, refined symbols with
 *   color—elegance in restraint.
 */

import type { Theme } from './types'

/**
 * Socket Security — The signature theme. Refined violet with subtle shimmer,
 * designed for focus and elegance.
 */
export const SOCKET_THEME: Theme = {
  colors: {
    primary: [140, 82, 255],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'blueBright',
    step: 'cyanBright',
    text: 'white',
    textDim: 'gray',
    link: 'cyanBright',
    prompt: 'primary',
  },
  displayName: 'Socket Security',
  effects: {
    spinner: {
      color: 'primary',
      style: 'socket',
    },
    shimmer: {
      enabled: true,
      color: 'inherit',
      direction: 'ltr',
      speed: 0.33,
    },
  },
  meta: {
    description: 'Signature theme with refined violet and subtle shimmer',
    version: '1.0.0',
  },
  name: 'socket',
}

/**
 * Sunset — Vibrant twilight gradient. Warm sunset palette with orange and
 * purple/pink tones.
 */
export const SUNSET_THEME: Theme = {
  colors: {
    primary: [255, 140, 100],
    secondary: [200, 100, 180],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'magentaBright',
    step: 'magentaBright',
    text: 'white',
    textDim: 'gray',
    link: 'primary',
    prompt: 'primary',
  },
  displayName: 'Sunset',
  effects: {
    spinner: {
      color: 'primary',
      style: 'dots',
    },
    shimmer: {
      enabled: true,
      color: [
        [200, 100, 180],
        [255, 140, 100],
      ],
      direction: 'ltr',
      speed: 0.4,
    },
  },
  meta: {
    description: 'Warm sunset theme with purple-to-orange gradient',
    version: '2.0.0',
  },
  name: 'sunset',
}

/**
 * Terracotta — Solid warmth. Rich terracotta and ember tones for grounded
 * confidence.
 */
export const TERRACOTTA_THEME: Theme = {
  colors: {
    primary: [255, 100, 50],
    secondary: [255, 150, 100],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'blueBright',
    step: 'cyanBright',
    text: 'white',
    textDim: 'gray',
    link: 'secondary',
    prompt: 'primary',
  },
  displayName: 'Terracotta',
  effects: {
    spinner: {
      color: 'primary',
      style: 'socket',
    },
    shimmer: {
      enabled: true,
      color: 'inherit',
      direction: 'ltr',
      speed: 0.5,
    },
  },
  meta: {
    description: 'Solid theme with rich terracotta and ember warmth',
    version: '1.0.0',
  },
  name: 'terracotta',
}

/**
 * Lush — Steel elegance. Python-inspired steel blue with golden accents.
 */
export const LUSH_THEME: Theme = {
  colors: {
    primary: [70, 130, 180],
    secondary: [255, 215, 0],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'blueBright',
    step: 'cyanBright',
    text: 'white',
    textDim: 'gray',
    link: 'cyanBright',
    prompt: 'primary',
  },
  displayName: 'Lush',
  effects: {
    spinner: {
      color: 'primary',
      style: 'dots',
    },
  },
  meta: {
    description: 'Elegant theme with steel blue and golden harmony',
    version: '1.0.0',
  },
  name: 'lush',
}

/**
 * Ultra — Premium intensity. Prismatic shimmer for deep analysis, where
 * complexity meets elegance.
 */
export const ULTRA_THEME: Theme = {
  colors: {
    primary: [140, 82, 255],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'cyanBright',
    step: 'magentaBright',
    text: 'whiteBright',
    textDim: 'gray',
    link: 'cyanBright',
    prompt: 'primary',
  },
  displayName: 'Ultra',
  effects: {
    spinner: {
      color: 'inherit',
      style: 'socket',
    },
    shimmer: {
      enabled: true,
      color: 'rainbow',
      direction: 'bi',
      speed: 0.5,
    },
  },
  meta: {
    description: 'Premium theme with prismatic shimmer for deep analysis',
    version: '1.0.0',
  },
  name: 'ultra',
}

/**
 * Theme registry — Curated palette collection.
 */
export const THEMES = {
  __proto__: null,
  socket: SOCKET_THEME,
  sunset: SUNSET_THEME,
  terracotta: TERRACOTTA_THEME,
  lush: LUSH_THEME,
  ultra: ULTRA_THEME,
} as const

/**
 * Available theme identifiers.
 */
export type ThemeName = keyof typeof THEMES
