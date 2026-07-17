import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkExport } from '../../../scripts/validate/dist-exports.mts'

let tmpDir: string | undefined

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { force: true, recursive: true })
    tmpDir = undefined
  }
})

describe('checkExport', () => {
  it('skips a node shebang entrypoint without loading its side effects', () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dist-exports-test-'))
    const entrypoint = path.join(tmpDir, 'native-host.js')
    writeFileSync(
      entrypoint,
      '#!/usr/bin/env node\nthrow new Error("entrypoint was loaded")\n',
    )

    expect(checkExport(entrypoint)).toMatchObject({
      ok: true,
      skipped: true,
    })
  })
})
