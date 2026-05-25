/**
 * @file Unit tests for src/bin/shadow — isShadowBinPath. Split out of the
 *   historical monolithic test/unit/bin.test.mts to keep each test file under
 *   the fleet's 500-line soft cap.
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { isShadowBinPath } from '../../../src/bin/shadow'

describe('isShadowBinPath', () => {
  it('should return false for undefined', () => {
    const result = isShadowBinPath(undefined)
    expect(result).toBe(false)
  })

  it('should return false for empty string', () => {
    const result = isShadowBinPath('')
    expect(result).toBe(false)
  })

  it('should return true for Unix node_modules/.bin path', () => {
    const result = isShadowBinPath('/path/to/node_modules/.bin')
    expect(result).toBe(true)
  })

  it('should return true for Windows node_modules/.bin path', () => {
    const result = isShadowBinPath('C:\\path\\to\\node_modules\\.bin')
    expect(result).toBe(true)
  })

  it('should return true for nested node_modules/.bin path', () => {
    const result = isShadowBinPath('/home/user/project/node_modules/.bin/pnpm')
    expect(result).toBe(true)
  })

  it('should return false for regular bin path', () => {
    const result = isShadowBinPath('/usr/local/bin')
    expect(result).toBe(false)
  })

  it('should return false for path without node_modules', () => {
    const result = isShadowBinPath('/usr/bin/npm')
    expect(result).toBe(false)
  })

  it('should handle mixed slashes', () => {
    const result = isShadowBinPath('C:/path/to/node_modules/.bin')
    expect(result).toBe(true)
  })

  it('should return false for node_modules without .bin', () => {
    const result = isShadowBinPath('/path/to/node_modules')
    expect(result).toBe(false)
  })
})
