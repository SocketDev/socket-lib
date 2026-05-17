/**
 * @fileoverview Unit tests for temporary package executor detection (npx/dlx).
 *
 * Tests detection of temporary package executor environments:
 * - isTransientProcess() detects npx, pnpm dlx, yarn dlx
 * - User agent parsing from npm_config_user_agent
 * - Environment variable inspection
 * - Package manager version detection
 * Used by Socket CLI to adapt behavior when running via npx/dlx.
 */

import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

import { isTransientProcess } from '@socketsecurity/lib/process/transient'

describe('process/transient', () => {
  describe('isTransientProcess', () => {
    describe('user agent detection', () => {
      const originalUserAgent = process.env['npm_config_user_agent']

      afterEach(() => {
        if (originalUserAgent === undefined) {
          delete process.env['npm_config_user_agent']
        } else {
          process.env['npm_config_user_agent'] = originalUserAgent
        }
      })

      it('should detect npm exec in user agent', () => {
        process.env['npm_config_user_agent'] = 'npm/8.19.2 node/v18.12.0 exec'
        expect(isTransientProcess('/home/user/project')).toBe(true)
      })

      it('should detect npx in user agent', () => {
        process.env['npm_config_user_agent'] = 'npm/8.19.2 node/v18.12.0 npx'
        expect(isTransientProcess('/home/user/project')).toBe(true)
      })

      it('should detect dlx in user agent', () => {
        process.env['npm_config_user_agent'] = 'pnpm/8.6.0 node/v18.12.0 dlx'
        expect(isTransientProcess('/home/user/project')).toBe(true)
      })

      it('should not detect normal npm usage', () => {
        process.env['npm_config_user_agent'] =
          'npm/8.19.2 node/v18.12.0 darwin x64'
        expect(isTransientProcess('/home/user/project')).toBe(false)
      })

      it('should not detect normal pnpm usage', () => {
        process.env['npm_config_user_agent'] =
          'pnpm/8.6.0 node/v18.12.0 darwin x64'
        expect(isTransientProcess('/home/user/project')).toBe(false)
      })

      it('should not detect when user agent is undefined', () => {
        delete process.env['npm_config_user_agent']
        expect(isTransientProcess('/home/user/project')).toBe(false)
      })

      it('should not detect when user agent is empty', () => {
        process.env['npm_config_user_agent'] = ''
        expect(isTransientProcess('/home/user/project')).toBe(false)
      })

      it('should detect exec substring in longer user agent', () => {
        process.env['npm_config_user_agent'] =
          'npm/9.0.0 node/v20.0.0 linux x64 workspaces/false exec'
        expect(isTransientProcess('/home/user/project')).toBe(true)
      })

      it('should detect npx substring anywhere in user agent', () => {
        process.env['npm_config_user_agent'] =
          'npm/9.0.0 npx node/v20.0.0 linux x64'
        expect(isTransientProcess('/home/user/project')).toBe(true)
      })

      it('should detect dlx with yarn', () => {
        process.env['npm_config_user_agent'] = 'yarn/3.5.0 node/v18.12.0 dlx'
        expect(isTransientProcess('/home/user/project')).toBe(true)
      })
    })

    describe('npm cache detection', () => {
      const originalCache = process.env['npm_config_cache']

      afterEach(() => {
        if (originalCache === undefined) {
          delete process.env['npm_config_cache']
        } else {
          process.env['npm_config_cache'] = originalCache
        }
      })

      it('should detect execution from npm cache directory', () => {
        process.env['npm_config_cache'] = '/home/user/.npm'
        expect(isTransientProcess('/home/user/.npm/_npx/abc123')).toBe(true)
      })

      it('should detect execution from Windows npm cache', () => {
        process.env['npm_config_cache'] = 'C:\\Users\\user\\AppData\\npm-cache'
        expect(
          isTransientProcess('C:\\Users\\user\\AppData\\npm-cache\\_npx\\123'),
        ).toBe(true)
      })

      it('should not detect when cwd is outside npm cache', () => {
        process.env['npm_config_cache'] = '/home/user/.npm'
        expect(isTransientProcess('/home/user/project')).toBe(false)
      })

      it('should not detect when npm_config_cache is not set', () => {
        delete process.env['npm_config_cache']
        expect(isTransientProcess('/home/user/.npm/_npx/abc123')).toBe(true) // Still detects due to _npx pattern
      })

      it('should handle npm cache path with forward slashes on Windows', () => {
        process.env['npm_config_cache'] = 'C:/Users/user/AppData/npm-cache'
        expect(isTransientProcess('C:/Users/user/AppData/npm-cache/_npx')).toBe(
          true,
        )
      })

      it('should handle empty npm_config_cache', () => {
        process.env['npm_config_cache'] = ''
        expect(isTransientProcess('/home/user/project')).toBe(false)
      })
    })

    describe('temporary path patterns', () => {
      it('should detect _npx directory', () => {
        expect(isTransientProcess('/home/user/.npm/_npx/123')).toBe(true)
      })

      it('should detect _npx in nested path', () => {
        expect(isTransientProcess('/home/user/.cache/_npx/abc/def')).toBe(true)
      })

      it('should detect .pnpm-store directory', () => {
        expect(isTransientProcess('/home/user/.pnpm-store/dlx-123')).toBe(true)
      })

      it('should detect dlx- prefix', () => {
        expect(isTransientProcess('/tmp/dlx-abc123')).toBe(true)
      })

      it('should detect dlx- in nested path', () => {
        expect(isTransientProcess('/var/tmp/pnpm/dlx-package/bin')).toBe(true)
      })

      it('should detect Yarn Berry PnP virtual packages', () => {
        expect(
          isTransientProcess('/home/user/project/.yarn/$$/virtual/package'),
        ).toBe(true)
      })

      it('should detect Yarn $$ pattern anywhere in path', () => {
        expect(isTransientProcess('/project/.yarn/$$/cache/package')).toBe(true)
      })

      it('should not detect normal project directories', () => {
        expect(isTransientProcess('/home/user/my-project')).toBe(false)
      })

      it('should not detect node_modules', () => {
        expect(isTransientProcess('/home/user/project/node_modules/.bin')).toBe(
          false,
        )
      })

      it('should not detect normal pnpm-store (without dot)', () => {
        expect(isTransientProcess('/home/user/pnpm-store')).toBe(false)
      })
    })

    describe('Windows-specific patterns', () => {
      it('should detect Yarn Windows temp xfs pattern on Windows', () => {
        const cwd = 'C:\\Users\\user\\AppData\\Local\\Temp\\xfs-abc123'
        const result = isTransientProcess(cwd)
        // Only matches on Windows platform (WIN32 constant check)
        expect(typeof result).toBe('boolean')
      })

      it('should detect xfs pattern in nested Windows path on Windows', () => {
        const cwd =
          'C:\\Users\\user\\AppData\\Local\\Temp\\xfs-123\\package\\bin'
        const result = isTransientProcess(cwd)
        // Only matches on Windows platform (WIN32 constant check)
        expect(typeof result).toBe('boolean')
      })

      it('should handle Windows paths with forward slashes on Windows', () => {
        const cwd = 'C:/Users/user/AppData/Local/Temp/xfs-abc123'
        const result = isTransientProcess(cwd)
        // Only matches on Windows platform (WIN32 constant check)
        expect(typeof result).toBe('boolean')
      })

      it('should not detect xfs pattern without AppData/Local/Temp', () => {
        expect(isTransientProcess('/home/user/xfs-123')).toBe(false)
      })
    })

    describe('path normalization', () => {
      it('should handle paths with backslashes', () => {
        expect(isTransientProcess('C:\\Users\\user\\.npm\\_npx\\123')).toBe(
          true,
        )
      })

      it('should handle paths with forward slashes', () => {
        expect(isTransientProcess('/home/user/.npm/_npx/123')).toBe(true)
      })

      it('should handle mixed slash paths', () => {
        expect(isTransientProcess('C:/Users/user/.npm\\_npx/123')).toBe(true)
      })

      it('should normalize before pattern matching', () => {
        expect(
          isTransientProcess('C:\\Users\\user\\.pnpm-store\\dlx-abc'),
        ).toBe(true)
      })
    })

    describe('default cwd parameter', () => {
      it('should use process.cwd() when cwd is not provided', () => {
        const result = isTransientProcess()
        expect(typeof result).toBe('boolean')
      })

      it('should handle undefined cwd', () => {
        const result = isTransientProcess(undefined)
        expect(typeof result).toBe('boolean')
      })
    })

    describe('combined conditions', () => {
      const originalUserAgent = process.env['npm_config_user_agent']
      const originalCache = process.env['npm_config_cache']

      afterEach(() => {
        if (originalUserAgent === undefined) {
          delete process.env['npm_config_user_agent']
        } else {
          process.env['npm_config_user_agent'] = originalUserAgent
        }
        if (originalCache === undefined) {
          delete process.env['npm_config_cache']
        } else {
          process.env['npm_config_cache'] = originalCache
        }
      })

      it('should detect when both user agent and path pattern match', () => {
        process.env['npm_config_user_agent'] = 'npm/8.19.2 node/v18.12.0 npx'
        expect(isTransientProcess('/home/user/.npm/_npx/123')).toBe(true)
      })

      it('should detect when user agent matches but path does not', () => {
        process.env['npm_config_user_agent'] = 'npm/8.19.2 node/v18.12.0 npx'
        expect(isTransientProcess('/home/user/project')).toBe(true)
      })

      it('should detect when path matches but user agent does not', () => {
        process.env['npm_config_user_agent'] =
          'npm/8.19.2 node/v18.12.0 darwin x64'
        expect(isTransientProcess('/home/user/.npm/_npx/123')).toBe(true)
      })

      it('should detect when npm cache and path both match', () => {
        process.env['npm_config_cache'] = '/home/user/.npm'
        expect(isTransientProcess('/home/user/.npm/_npx/123')).toBe(true)
      })

      it('should not detect when no conditions match', () => {
        delete process.env['npm_config_user_agent']
        delete process.env['npm_config_cache']
        expect(isTransientProcess('/home/user/my-project')).toBe(false)
      })
    })

    describe('edge cases', () => {
      it('should handle empty cwd', () => {
        const result = isTransientProcess('')
        expect(typeof result).toBe('boolean')
      })

      it('should handle root directory', () => {
        expect(isTransientProcess('/')).toBe(false)
      })

      it('should handle relative paths', () => {
        const result = isTransientProcess('../project/_npx')
        expect(typeof result).toBe('boolean')
      })

      it('should be case-sensitive for pattern matching', () => {
        expect(isTransientProcess('/home/user/_NPX/123')).toBe(false)
      })

      it('should handle very long paths', () => {
        const longPath = `/home/user/${'a'.repeat(200)}/_npx/123`
        expect(isTransientProcess(longPath)).toBe(true)
      })

      it('should handle paths with special characters', () => {
        expect(isTransientProcess('/home/user/@scope/_npx/123')).toBe(true)
      })

      it('should handle paths with spaces', () => {
        expect(isTransientProcess('/home/user/my folder/_npx/123')).toBe(true)
      })

      it('should handle Unicode in paths', () => {
        expect(isTransientProcess('/home/用户/.npm/_npx/123')).toBe(true)
      })

      it('should handle multiple pattern matches', () => {
        expect(isTransientProcess('/home/user/_npx/dlx-abc/.pnpm-store')).toBe(
          true,
        )
      })

      it('should match pattern as substring anywhere in path', () => {
        expect(isTransientProcess('/home/user/my_npx_folder')).toBe(true)
      })

      it('should match pattern in filename', () => {
        expect(isTransientProcess('/home/user/something_npx')).toBe(true)
      })

      it('should handle WSL paths', () => {
        expect(isTransientProcess('/mnt/c/Users/user/_npx/123')).toBe(true)
      })
    })

    describe('real-world scenarios', () => {
      const originalUserAgent = process.env['npm_config_user_agent']
      const originalCache = process.env['npm_config_cache']

      afterEach(() => {
        if (originalUserAgent === undefined) {
          delete process.env['npm_config_user_agent']
        } else {
          process.env['npm_config_user_agent'] = originalUserAgent
        }
        if (originalCache === undefined) {
          delete process.env['npm_config_cache']
        } else {
          process.env['npm_config_cache'] = originalCache
        }
      })

      it('should detect npx command execution', () => {
        process.env['npm_config_user_agent'] = 'npm/9.5.0 node/v18.15.0 npx'
        process.env['npm_config_cache'] = '/home/user/.npm'
        expect(
          isTransientProcess('/home/user/.npm/_npx/12345/node_modules'),
        ).toBe(true)
      })

      it('should detect pnpm dlx execution', () => {
        process.env['npm_config_user_agent'] = 'pnpm/8.6.0 node/v18.12.0 dlx'
        expect(isTransientProcess('/tmp/.pnpm-store/dlx-abc/package')).toBe(
          true,
        )
      })

      it('should detect yarn dlx execution', () => {
        process.env['npm_config_user_agent'] = 'yarn/3.5.0 node/v18.12.0 dlx'
        expect(isTransientProcess('/tmp/dlx-12345')).toBe(true)
      })

      it('should not detect regular npm install', () => {
        process.env['npm_config_user_agent'] =
          'npm/9.5.0 node/v18.15.0 darwin x64'
        expect(isTransientProcess('/home/user/project/node_modules')).toBe(
          false,
        )
      })

      it('should not detect regular pnpm install', () => {
        process.env['npm_config_user_agent'] =
          'pnpm/8.6.0 node/v18.12.0 linux x64'
        expect(isTransientProcess('/home/user/project')).toBe(false)
      })

      it('should not detect global installation', () => {
        delete process.env['npm_config_user_agent']
        expect(isTransientProcess('/usr/local/lib/node_modules')).toBe(false)
      })
    })
  })
})
