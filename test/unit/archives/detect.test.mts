import { describe, expect, it } from 'vitest'

import { detectArchiveFormat } from '../../../src/archives/detect'

describe('archives/detect — detectArchiveFormat', () => {
  it('detects zip format from asset name', () => {
    expect(detectArchiveFormat('release.zip')).toBe('zip')
    expect(detectArchiveFormat('package-v1.0.0.zip')).toBe('zip')
  })

  it('detects tar format from asset name', () => {
    expect(detectArchiveFormat('release.tar')).toBe('tar')
    expect(detectArchiveFormat('package-v1.0.0.tar')).toBe('tar')
  })

  it('detects tar.gz format from asset name', () => {
    expect(detectArchiveFormat('release.tar.gz')).toBe('tar.gz')
    expect(detectArchiveFormat('package-v1.0.0.tar.gz')).toBe('tar.gz')
  })

  it('detects tgz format from asset name', () => {
    expect(detectArchiveFormat('release.tgz')).toBe('tgz')
    expect(detectArchiveFormat('package-v1.0.0.tgz')).toBe('tgz')
  })

  it('returns undefined for unsupported formats', () => {
    expect(detectArchiveFormat('release.exe')).toBeUndefined()
    expect(detectArchiveFormat('release.dmg')).toBeUndefined()
    expect(detectArchiveFormat('release')).toBeUndefined()
  })
})
