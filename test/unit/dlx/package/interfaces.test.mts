/**
 * @file Unit tests for src/dlx/package — interfaces surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

import {
  DlxPackageOptions,
  DlxPackageResult,
} from '../../../../src/dlx/package'

describe('DlxPackageOptions interface', () => {
  it('should accept valid package specs', () => {
    const options: DlxPackageOptions = {
      package: 'cowsay@1.6.0',
    }

    expect(options.package).toBe('cowsay@1.6.0')
    expect(options.force).toBeUndefined()
    expect(options.spawnOptions).toBeUndefined()
  })

  it('should accept force option', () => {
    const options: DlxPackageOptions = {
      force: true,
      package: 'cowsay@1.6.0',
    }

    expect(options.force).toBe(true)
  })

  it('should accept yes option (CLI-style)', () => {
    const options: DlxPackageOptions = {
      package: 'cowsay@1.6.0',
      yes: true,
    }

    expect(options.yes).toBe(true)
  })

  it('should accept quiet option (CLI-style, reserved)', () => {
    const options: DlxPackageOptions = {
      package: 'cowsay@1.6.0',
      quiet: true,
    }

    expect(options.quiet).toBe(true)
  })

  it('should accept spawn options', () => {
    const options: DlxPackageOptions = {
      package: 'cowsay@1.6.0',
      spawnOptions: {
        cwd: '/tmp',
        env: { FOO: 'bar' },
      },
    }

    expect(options.spawnOptions?.cwd).toBe('/tmp')
    expect(options.spawnOptions?.env?.['FOO']).toBe('bar')
  })

  it('should handle yes and force together', () => {
    const options: DlxPackageOptions = {
      force: false,
      package: 'cowsay@1.6.0',
      yes: true,
    }

    // Both flags can be set independently
    expect(options.yes).toBe(true)
    expect(options.force).toBe(false)
    // In implementation, yes takes precedence and implies force
  })
})

describe('DlxPackageResult interface', () => {
  it('should have correct field types', () => {
    // Verify interface structure at compile time.
    const result: Partial<DlxPackageResult> = {
      binaryPath: '/path/to/binary',
      installed: true,
      packageDir: '/path/to/package',
    }

    expect(result.packageDir).toBe('/path/to/package')
    expect(result.binaryPath).toBe('/path/to/binary')
    expect(result.installed).toBe(true)
  })
})
