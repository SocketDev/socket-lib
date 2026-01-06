/**
 * @fileoverview Unit tests for file extension constants.
 *
 * Tests file extension constants used throughout Socket tooling:
 * - JavaScript variants (.js, .mjs, .cjs, .mts, .cts)
 * - TypeScript (.d.ts)
 * - Configuration formats (.json, .yaml, .yml)
 * - Lock files (.lock, .lockb)
 * - Documentation (.md)
 * - Shell scripts (.cmd, .ps1)
 * Used for consistent extension handling across file operations.
 */

import {
  EXT_CJS,
  EXT_CMD,
  EXT_CTS,
  EXT_DTS,
  EXT_JS,
  EXT_JSON,
  EXT_LOCK,
  EXT_LOCKB,
  EXT_MD,
  EXT_MJS,
  EXT_MTS,
  EXT_PS1,
  EXT_YAML,
  EXT_YML,
} from '@socketsecurity/lib/paths/exts'
import { describe, expect, it } from 'vitest'

describe('paths/exts', () => {
  describe('EXT_CJS', () => {
    it('should be .cjs', () => {
      expect(EXT_CJS).toBe('.cjs')
    })

    it('should start with dot', () => {
      expect(EXT_CJS.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_CMD', () => {
    it('should be .cmd', () => {
      expect(EXT_CMD).toBe('.cmd')
    })

    it('should start with dot', () => {
      expect(EXT_CMD.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_CTS', () => {
    it('should be .cts', () => {
      expect(EXT_CTS).toBe('.cts')
    })

    it('should start with dot', () => {
      expect(EXT_CTS.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_DTS', () => {
    it('should be .d.ts', () => {
      expect(EXT_DTS).toBe('.d.ts')
    })

    it('should start with dot', () => {
      expect(EXT_DTS.startsWith('.')).toBe(true)
    })

    it('should end with .ts', () => {
      expect(EXT_DTS.endsWith('.ts')).toBe(true)
    })
  })

  describe('EXT_JS', () => {
    it('should be .js', () => {
      expect(EXT_JS).toBe('.js')
    })

    it('should start with dot', () => {
      expect(EXT_JS.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_JSON', () => {
    it('should be .json', () => {
      expect(EXT_JSON).toBe('.json')
    })

    it('should start with dot', () => {
      expect(EXT_JSON.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_LOCK', () => {
    it('should be .lock', () => {
      expect(EXT_LOCK).toBe('.lock')
    })

    it('should start with dot', () => {
      expect(EXT_LOCK.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_LOCKB', () => {
    it('should be .lockb', () => {
      expect(EXT_LOCKB).toBe('.lockb')
    })

    it('should start with dot', () => {
      expect(EXT_LOCKB.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_MD', () => {
    it('should be .md', () => {
      expect(EXT_MD).toBe('.md')
    })

    it('should start with dot', () => {
      expect(EXT_MD.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_MJS', () => {
    it('should be .mjs', () => {
      expect(EXT_MJS).toBe('.mjs')
    })

    it('should start with dot', () => {
      expect(EXT_MJS.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_MTS', () => {
    it('should be .mts', () => {
      expect(EXT_MTS).toBe('.mts')
    })

    it('should start with dot', () => {
      expect(EXT_MTS.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_PS1', () => {
    it('should be .ps1', () => {
      expect(EXT_PS1).toBe('.ps1')
    })

    it('should start with dot', () => {
      expect(EXT_PS1.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_YAML', () => {
    it('should be .yaml', () => {
      expect(EXT_YAML).toBe('.yaml')
    })

    it('should start with dot', () => {
      expect(EXT_YAML.startsWith('.')).toBe(true)
    })
  })

  describe('EXT_YML', () => {
    it('should be .yml', () => {
      expect(EXT_YML).toBe('.yml')
    })

    it('should start with dot', () => {
      expect(EXT_YML.startsWith('.')).toBe(true)
    })
  })

  describe('all extensions', () => {
    it('should all start with dot', () => {
      const extensions = [
        EXT_CJS,
        EXT_CMD,
        EXT_CTS,
        EXT_DTS,
        EXT_JS,
        EXT_JSON,
        EXT_LOCK,
        EXT_LOCKB,
        EXT_MD,
        EXT_MJS,
        EXT_MTS,
        EXT_PS1,
        EXT_YAML,
        EXT_YML,
      ]

      for (const ext of extensions) {
        expect(ext.startsWith('.')).toBe(true)
      }
    })

    it('should all be non-empty strings', () => {
      const extensions = [
        EXT_CJS,
        EXT_CMD,
        EXT_CTS,
        EXT_DTS,
        EXT_JS,
        EXT_JSON,
        EXT_LOCK,
        EXT_LOCKB,
        EXT_MD,
        EXT_MJS,
        EXT_MTS,
        EXT_PS1,
        EXT_YAML,
        EXT_YML,
      ]

      for (const ext of extensions) {
        expect(typeof ext).toBe('string')
        expect(ext.length).toBeGreaterThan(1)
      }
    })

    it('should not contain path separators', () => {
      const extensions = [
        EXT_CJS,
        EXT_CMD,
        EXT_CTS,
        EXT_DTS,
        EXT_JS,
        EXT_JSON,
        EXT_LOCK,
        EXT_LOCKB,
        EXT_MD,
        EXT_MJS,
        EXT_MTS,
        EXT_PS1,
        EXT_YAML,
        EXT_YML,
      ]

      for (const ext of extensions) {
        expect(ext).not.toContain('/')
        expect(ext).not.toContain('\\')
      }
    })

    it('should have JavaScript module extensions', () => {
      const jsExtensions = [EXT_JS, EXT_MJS, EXT_CJS]
      expect(jsExtensions).toContain('.js')
      expect(jsExtensions).toContain('.mjs')
      expect(jsExtensions).toContain('.cjs')
    })

    it('should have TypeScript module extensions', () => {
      const tsExtensions = [EXT_MTS, EXT_CTS, EXT_DTS]
      expect(tsExtensions).toContain('.mts')
      expect(tsExtensions).toContain('.cts')
      expect(tsExtensions).toContain('.d.ts')
    })

    it('should have YAML extensions', () => {
      const yamlExtensions = [EXT_YAML, EXT_YML]
      expect(yamlExtensions).toContain('.yaml')
      expect(yamlExtensions).toContain('.yml')
    })

    it('should have lock file extensions', () => {
      const lockExtensions = [EXT_LOCK, EXT_LOCKB]
      expect(lockExtensions).toContain('.lock')
      expect(lockExtensions).toContain('.lockb')
    })
  })
})
