/**
 * @file Unit tests for Windows environment variable getters. Tests
 *   Windows-specific environment variable accessors:
 *
 *   - getUserprofile() - user profile directory (USERPROFILE, Windows equivalent
 *     of HOME)
 *   - getAppdata() - application data directory (APPDATA)
 *   - getLocalappdata() - local application data directory (LOCALAPPDATA)
 *   - getComspec() - command interpreter path (COMSPEC, typically cmd.exe) Uses
 *     rewire for test isolation. Critical for Windows path resolution and app
 *     storage.
 */

import path from 'node:path'

import {
  getAppdata,
  getAppdataDir,
  getComspec,
  getLocalappdata,
  getUserprofile,
} from '../../../src/env/windows.mjs'
import { resetEnv, setEnv } from '../../../src/env/rewire.mjs'
import { afterEach, describe, expect, it } from 'vitest'

describe('windows env', () => {
  afterEach(() => {
    resetEnv()
  })

  describe('getAppdata', () => {
    it('should return APPDATA path when set', () => {
      setEnv('APPDATA', 'C:\\Users\\TestUser\\AppData\\Roaming')
      expect(getAppdata()).toBe('C:\\Users\\TestUser\\AppData\\Roaming')
    })

    it('should return undefined when not set', () => {
      setEnv('APPDATA', undefined)
      expect(getAppdata()).toBeUndefined()
    })
  })

  describe('getAppdataDir', () => {
    it('should return APPDATA when set, ignoring the home fallback', () => {
      setEnv('APPDATA', 'C:\\Users\\TestUser\\AppData\\Roaming')
      expect(getAppdataDir('C:\\Users\\Other')).toBe(
        'C:\\Users\\TestUser\\AppData\\Roaming',
      )
    })

    it('should fall back to homeDir/AppData/Roaming when APPDATA is unset', () => {
      setEnv('APPDATA', undefined)
      expect(getAppdataDir('/home/example-user')).toBe(
        path.join('/home/example-user', 'AppData', 'Roaming'),
      )
    })
  })

  describe('getLocalappdata', () => {
    it('should return LOCALAPPDATA path when set', () => {
      setEnv('LOCALAPPDATA', 'C:\\Users\\TestUser\\AppData\\Local')
      expect(getLocalappdata()).toBe('C:\\Users\\TestUser\\AppData\\Local')
    })

    it('should return undefined when not set', () => {
      setEnv('LOCALAPPDATA', undefined)
      expect(getLocalappdata()).toBeUndefined()
    })
  })

  describe('getUserprofile', () => {
    it('should return USERPROFILE path when set', () => {
      setEnv('USERPROFILE', 'C:\\Users\\TestUser')
      expect(getUserprofile()).toBe('C:\\Users\\TestUser')
    })

    it('should return undefined when not set', () => {
      setEnv('USERPROFILE', undefined)
      expect(getUserprofile()).toBeUndefined()
    })
  })

  describe('getComspec', () => {
    it('should return COMSPEC path when set', () => {
      setEnv('COMSPEC', 'C:\\Windows\\System32\\cmd.exe')
      expect(getComspec()).toBe('C:\\Windows\\System32\\cmd.exe')
    })

    it('should return undefined when not set', () => {
      setEnv('COMSPEC', undefined)
      expect(getComspec()).toBeUndefined()
    })
  })
})
