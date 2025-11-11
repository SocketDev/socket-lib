/**
 * @fileoverview Unit tests for NPM lifecycle script names.
 */

import { lifecycleScriptNames } from '@socketsecurity/lib/lifecycle-script-names'
import { describe, expect, it } from 'vitest'

describe('lifecycle-script-names', () => {
  it('should export a Set', () => {
    expect(lifecycleScriptNames).toBeInstanceOf(Set)
  })

  it('should contain standard lifecycle scripts', () => {
    const expected = [
      'dependencies',
      'prepublishOnly',
      'preinstall',
      'install',
      'postinstall',
      'prepack',
      'pack',
      'postpack',
      'preprepare',
      'prepare',
      'postprepare',
      'prepublish',
      'publish',
      'postpublish',
      'prerestart',
      'restart',
      'postrestart',
      'prestart',
      'start',
      'poststart',
      'prestop',
      'stop',
      'poststop',
      'preversion',
      'version',
      'postversion',
    ]

    for (const script of expected) {
      expect(lifecycleScriptNames.has(script)).toBe(true)
    }
  })

  it('should have correct size', () => {
    // dependencies + prepublishOnly + (8 base scripts * 3 phases each)
    expect(lifecycleScriptNames.size).toBe(26)
  })

  it('should contain all pre- variants', () => {
    const preScripts = [
      'preinstall',
      'prepack',
      'preprepare',
      'prepublish',
      'prerestart',
      'prestart',
      'prestop',
      'preversion',
    ]

    for (const script of preScripts) {
      expect(lifecycleScriptNames.has(script)).toBe(true)
    }
  })

  it('should contain all post- variants', () => {
    const postScripts = [
      'postinstall',
      'postpack',
      'postprepare',
      'postpublish',
      'postrestart',
      'poststart',
      'poststop',
      'postversion',
    ]

    for (const script of postScripts) {
      expect(lifecycleScriptNames.has(script)).toBe(true)
    }
  })

  it('should contain base scripts without prefix', () => {
    const baseScripts = [
      'install',
      'pack',
      'prepare',
      'publish',
      'restart',
      'start',
      'stop',
      'version',
    ]

    for (const script of baseScripts) {
      expect(lifecycleScriptNames.has(script)).toBe(true)
    }
  })

  it('should contain dependencies script', () => {
    expect(lifecycleScriptNames.has('dependencies')).toBe(true)
  })

  it('should contain prepublishOnly script', () => {
    expect(lifecycleScriptNames.has('prepublishOnly')).toBe(true)
  })

  it('should not contain arbitrary scripts', () => {
    expect(lifecycleScriptNames.has('test')).toBe(false)
    expect(lifecycleScriptNames.has('build')).toBe(false)
    expect(lifecycleScriptNames.has('lint')).toBe(false)
  })

  it('should be iterable', () => {
    const scripts = [...lifecycleScriptNames]
    expect(scripts.length).toBeGreaterThan(0)
  })

  it('should contain only strings', () => {
    for (const script of lifecycleScriptNames) {
      expect(typeof script).toBe('string')
    }
  })
})
