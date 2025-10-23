/**
 * @fileoverview Unit tests for flag utilities.
 */

import {
  COMMON_FLAGS,
  type FlagValues,
  getLogLevel,
  isAll,
  isChanged,
  isCoverage,
  isDebug,
  isDryRun,
  isFix,
  isForce,
  isHelp,
  isJson,
  isQuiet,
  isStaged,
  isUpdate,
  isVerbose,
  isWatch,
} from '@socketsecurity/lib/argv/flags'
import { describe, expect, it } from 'vitest'

describe('argv/flags', () => {
  describe('getLogLevel', () => {
    it('should return "silent" for quiet flag', () => {
      expect(getLogLevel({ quiet: true })).toBe('silent')
      expect(getLogLevel({ silent: true })).toBe('silent')
      expect(getLogLevel(['--quiet'])).toBe('silent')
      expect(getLogLevel(['--silent'])).toBe('silent')
    })

    it('should return "debug" for debug flag', () => {
      expect(getLogLevel({ debug: true })).toBe('debug')
      expect(getLogLevel(['--debug'])).toBe('debug')
    })

    it('should return "verbose" for verbose flag', () => {
      expect(getLogLevel({ verbose: true })).toBe('verbose')
      expect(getLogLevel(['--verbose'])).toBe('verbose')
    })

    it('should return "info" as default', () => {
      expect(getLogLevel({})).toBe('info')
      expect(getLogLevel([])).toBe('info')
      expect(getLogLevel()).toBe('info')
    })

    it('should prioritize quiet over debug and verbose', () => {
      expect(getLogLevel({ quiet: true, debug: true, verbose: true })).toBe(
        'silent',
      )
    })

    it('should prioritize debug over verbose', () => {
      expect(getLogLevel({ debug: true, verbose: true })).toBe('debug')
    })
  })

  describe('isAll', () => {
    it('should detect all flag from FlagValues object', () => {
      expect(isAll({ all: true })).toBe(true)
      expect(isAll({ all: false })).toBe(false)
      expect(isAll({})).toBe(false)
    })

    it('should detect all flag from array', () => {
      expect(isAll(['--all'])).toBe(true)
      expect(isAll(['--other', '--all'])).toBe(true)
      expect(isAll(['--other'])).toBe(false)
      expect(isAll([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isAll(undefined)
      expect(typeof result).toBe('boolean')
    })

    it('should handle readonly arrays', () => {
      const args = ['--all'] as const
      expect(isAll(args)).toBe(true)
    })
  })

  describe('isChanged', () => {
    it('should detect changed flag from FlagValues object', () => {
      expect(isChanged({ changed: true })).toBe(true)
      expect(isChanged({ changed: false })).toBe(false)
      expect(isChanged({})).toBe(false)
    })

    it('should detect changed flag from array', () => {
      expect(isChanged(['--changed'])).toBe(true)
      expect(isChanged(['--other', '--changed'])).toBe(true)
      expect(isChanged(['--other'])).toBe(false)
      expect(isChanged([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isChanged(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isCoverage', () => {
    it('should detect coverage flag from FlagValues object', () => {
      expect(isCoverage({ coverage: true })).toBe(true)
      expect(isCoverage({ cover: true })).toBe(true)
      expect(isCoverage({ coverage: false, cover: false })).toBe(false)
      expect(isCoverage({})).toBe(false)
    })

    it('should detect coverage flag from array', () => {
      expect(isCoverage(['--coverage'])).toBe(true)
      expect(isCoverage(['--cover'])).toBe(true)
      expect(isCoverage(['--coverage', '--cover'])).toBe(true)
      expect(isCoverage(['--other'])).toBe(false)
      expect(isCoverage([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isCoverage(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isDebug', () => {
    it('should detect debug flag from FlagValues object', () => {
      expect(isDebug({ debug: true })).toBe(true)
      expect(isDebug({ debug: false })).toBe(false)
      expect(isDebug({})).toBe(false)
    })

    it('should detect debug flag from array', () => {
      expect(isDebug(['--debug'])).toBe(true)
      expect(isDebug(['--other', '--debug'])).toBe(true)
      expect(isDebug(['--other'])).toBe(false)
      expect(isDebug([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isDebug(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isDryRun', () => {
    it('should detect dry-run flag from FlagValues object', () => {
      expect(isDryRun({ 'dry-run': true })).toBe(true)
      expect(isDryRun({ 'dry-run': false })).toBe(false)
      expect(isDryRun({})).toBe(false)
    })

    it('should detect dry-run flag from array', () => {
      expect(isDryRun(['--dry-run'])).toBe(true)
      expect(isDryRun(['--other', '--dry-run'])).toBe(true)
      expect(isDryRun(['--other'])).toBe(false)
      expect(isDryRun([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isDryRun(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isFix', () => {
    it('should detect fix flag from FlagValues object', () => {
      expect(isFix({ fix: true })).toBe(true)
      expect(isFix({ fix: false })).toBe(false)
      expect(isFix({})).toBe(false)
    })

    it('should detect fix flag from array', () => {
      expect(isFix(['--fix'])).toBe(true)
      expect(isFix(['--other', '--fix'])).toBe(true)
      expect(isFix(['--other'])).toBe(false)
      expect(isFix([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isFix(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isForce', () => {
    it('should detect force flag from FlagValues object', () => {
      expect(isForce({ force: true })).toBe(true)
      expect(isForce({ force: false })).toBe(false)
      expect(isForce({})).toBe(false)
    })

    it('should detect force flag from array', () => {
      expect(isForce(['--force'])).toBe(true)
      expect(isForce(['--other', '--force'])).toBe(true)
      expect(isForce(['--other'])).toBe(false)
      expect(isForce([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isForce(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isHelp', () => {
    it('should detect help flag from FlagValues object', () => {
      expect(isHelp({ help: true })).toBe(true)
      expect(isHelp({ help: false })).toBe(false)
      expect(isHelp({})).toBe(false)
    })

    it('should detect help flag from array', () => {
      expect(isHelp(['--help'])).toBe(true)
      expect(isHelp(['-h'])).toBe(true)
      expect(isHelp(['--other', '--help'])).toBe(true)
      expect(isHelp(['--other', '-h'])).toBe(true)
      expect(isHelp(['--other'])).toBe(false)
      expect(isHelp([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isHelp(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isJson', () => {
    it('should detect json flag from FlagValues object', () => {
      expect(isJson({ json: true })).toBe(true)
      expect(isJson({ json: false })).toBe(false)
      expect(isJson({})).toBe(false)
    })

    it('should detect json flag from array', () => {
      expect(isJson(['--json'])).toBe(true)
      expect(isJson(['--other', '--json'])).toBe(true)
      expect(isJson(['--other'])).toBe(false)
      expect(isJson([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isJson(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isQuiet', () => {
    it('should detect quiet flag from FlagValues object', () => {
      expect(isQuiet({ quiet: true })).toBe(true)
      expect(isQuiet({ silent: true })).toBe(true)
      expect(isQuiet({ quiet: false, silent: false })).toBe(false)
      expect(isQuiet({})).toBe(false)
    })

    it('should detect quiet flag from array', () => {
      expect(isQuiet(['--quiet'])).toBe(true)
      expect(isQuiet(['--silent'])).toBe(true)
      expect(isQuiet(['--quiet', '--silent'])).toBe(true)
      expect(isQuiet(['--other'])).toBe(false)
      expect(isQuiet([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isQuiet(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isStaged', () => {
    it('should detect staged flag from FlagValues object', () => {
      expect(isStaged({ staged: true })).toBe(true)
      expect(isStaged({ staged: false })).toBe(false)
      expect(isStaged({})).toBe(false)
    })

    it('should detect staged flag from array', () => {
      expect(isStaged(['--staged'])).toBe(true)
      expect(isStaged(['--other', '--staged'])).toBe(true)
      expect(isStaged(['--other'])).toBe(false)
      expect(isStaged([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isStaged(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isUpdate', () => {
    it('should detect update flag from FlagValues object', () => {
      expect(isUpdate({ update: true })).toBe(true)
      expect(isUpdate({ update: false })).toBe(false)
      expect(isUpdate({})).toBe(false)
    })

    it('should detect update flag from array', () => {
      expect(isUpdate(['--update'])).toBe(true)
      expect(isUpdate(['-u'])).toBe(true)
      expect(isUpdate(['--other', '--update'])).toBe(true)
      expect(isUpdate(['--other', '-u'])).toBe(true)
      expect(isUpdate(['--other'])).toBe(false)
      expect(isUpdate([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isUpdate(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isVerbose', () => {
    it('should detect verbose flag from FlagValues object', () => {
      expect(isVerbose({ verbose: true })).toBe(true)
      expect(isVerbose({ verbose: false })).toBe(false)
      expect(isVerbose({})).toBe(false)
    })

    it('should detect verbose flag from array', () => {
      expect(isVerbose(['--verbose'])).toBe(true)
      expect(isVerbose(['--other', '--verbose'])).toBe(true)
      expect(isVerbose(['--other'])).toBe(false)
      expect(isVerbose([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isVerbose(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isWatch', () => {
    it('should detect watch flag from FlagValues object', () => {
      expect(isWatch({ watch: true })).toBe(true)
      expect(isWatch({ watch: false })).toBe(false)
      expect(isWatch({})).toBe(false)
    })

    it('should detect watch flag from array', () => {
      expect(isWatch(['--watch'])).toBe(true)
      expect(isWatch(['-w'])).toBe(true)
      expect(isWatch(['--other', '--watch'])).toBe(true)
      expect(isWatch(['--other', '-w'])).toBe(true)
      expect(isWatch(['--other'])).toBe(false)
      expect(isWatch([])).toBe(false)
    })

    it('should use process.argv when input is undefined', () => {
      const result = isWatch(undefined)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('COMMON_FLAGS', () => {
    it('should have all expected flags', () => {
      expect(COMMON_FLAGS).toHaveProperty('all')
      expect(COMMON_FLAGS).toHaveProperty('changed')
      expect(COMMON_FLAGS).toHaveProperty('coverage')
      expect(COMMON_FLAGS).toHaveProperty('cover')
      expect(COMMON_FLAGS).toHaveProperty('debug')
      expect(COMMON_FLAGS).toHaveProperty('dry-run')
      expect(COMMON_FLAGS).toHaveProperty('fix')
      expect(COMMON_FLAGS).toHaveProperty('force')
      expect(COMMON_FLAGS).toHaveProperty('help')
      expect(COMMON_FLAGS).toHaveProperty('json')
      expect(COMMON_FLAGS).toHaveProperty('quiet')
      expect(COMMON_FLAGS).toHaveProperty('silent')
      expect(COMMON_FLAGS).toHaveProperty('staged')
      expect(COMMON_FLAGS).toHaveProperty('update')
      expect(COMMON_FLAGS).toHaveProperty('verbose')
      expect(COMMON_FLAGS).toHaveProperty('watch')
    })

    it('should have boolean type for all flags', () => {
      expect(COMMON_FLAGS.all.type).toBe('boolean')
      expect(COMMON_FLAGS.changed.type).toBe('boolean')
      expect(COMMON_FLAGS.coverage.type).toBe('boolean')
      expect(COMMON_FLAGS.cover.type).toBe('boolean')
      expect(COMMON_FLAGS.debug.type).toBe('boolean')
      expect(COMMON_FLAGS['dry-run'].type).toBe('boolean')
      expect(COMMON_FLAGS.fix.type).toBe('boolean')
      expect(COMMON_FLAGS.force.type).toBe('boolean')
      expect(COMMON_FLAGS.help.type).toBe('boolean')
      expect(COMMON_FLAGS.json.type).toBe('boolean')
      expect(COMMON_FLAGS.quiet.type).toBe('boolean')
      expect(COMMON_FLAGS.silent.type).toBe('boolean')
      expect(COMMON_FLAGS.staged.type).toBe('boolean')
      expect(COMMON_FLAGS.update.type).toBe('boolean')
      expect(COMMON_FLAGS.verbose.type).toBe('boolean')
      expect(COMMON_FLAGS.watch.type).toBe('boolean')
    })

    it('should have descriptions for all flags', () => {
      expect(COMMON_FLAGS.all.description).toBeTruthy()
      expect(COMMON_FLAGS.changed.description).toBeTruthy()
      expect(COMMON_FLAGS.coverage.description).toBeTruthy()
      expect(COMMON_FLAGS.cover.description).toBeTruthy()
      expect(COMMON_FLAGS.debug.description).toBeTruthy()
      expect(COMMON_FLAGS['dry-run'].description).toBeTruthy()
      expect(COMMON_FLAGS.fix.description).toBeTruthy()
      expect(COMMON_FLAGS.force.description).toBeTruthy()
      expect(COMMON_FLAGS.help.description).toBeTruthy()
      expect(COMMON_FLAGS.json.description).toBeTruthy()
      expect(COMMON_FLAGS.quiet.description).toBeTruthy()
      expect(COMMON_FLAGS.silent.description).toBeTruthy()
      expect(COMMON_FLAGS.staged.description).toBeTruthy()
      expect(COMMON_FLAGS.update.description).toBeTruthy()
      expect(COMMON_FLAGS.verbose.description).toBeTruthy()
      expect(COMMON_FLAGS.watch.description).toBeTruthy()
    })

    it('should have default false for all flags', () => {
      expect(COMMON_FLAGS.all.default).toBe(false)
      expect(COMMON_FLAGS.changed.default).toBe(false)
      expect(COMMON_FLAGS.coverage.default).toBe(false)
      expect(COMMON_FLAGS.cover.default).toBe(false)
      expect(COMMON_FLAGS.debug.default).toBe(false)
      expect(COMMON_FLAGS['dry-run'].default).toBe(false)
      expect(COMMON_FLAGS.fix.default).toBe(false)
      expect(COMMON_FLAGS.force.default).toBe(false)
      expect(COMMON_FLAGS.help.default).toBe(false)
      expect(COMMON_FLAGS.json.default).toBe(false)
      expect(COMMON_FLAGS.quiet.default).toBe(false)
      expect(COMMON_FLAGS.silent.default).toBe(false)
      expect(COMMON_FLAGS.staged.default).toBe(false)
      expect(COMMON_FLAGS.update.default).toBe(false)
      expect(COMMON_FLAGS.verbose.default).toBe(false)
      expect(COMMON_FLAGS.watch.default).toBe(false)
    })

    it('should have short aliases where expected', () => {
      expect((COMMON_FLAGS.help as any).short).toBe('h')
      expect((COMMON_FLAGS.quiet as any).short).toBe('q')
      expect((COMMON_FLAGS.update as any).short).toBe('u')
      expect((COMMON_FLAGS.verbose as any).short).toBe('v')
      expect((COMMON_FLAGS.watch as any).short).toBe('w')
    })

    it('should not have short aliases where not expected', () => {
      expect((COMMON_FLAGS.all as any).short).toBeUndefined()
      expect((COMMON_FLAGS.changed as any).short).toBeUndefined()
      expect((COMMON_FLAGS.coverage as any).short).toBeUndefined()
      expect((COMMON_FLAGS.cover as any).short).toBeUndefined()
      expect((COMMON_FLAGS.debug as any).short).toBeUndefined()
      expect((COMMON_FLAGS['dry-run'] as any).short).toBeUndefined()
      expect((COMMON_FLAGS.fix as any).short).toBeUndefined()
      expect((COMMON_FLAGS.force as any).short).toBeUndefined()
      expect((COMMON_FLAGS.json as any).short).toBeUndefined()
      expect((COMMON_FLAGS.silent as any).short).toBeUndefined()
      expect((COMMON_FLAGS.staged as any).short).toBeUndefined()
    })
  })

  describe('FlagValues interface', () => {
    it('should accept flag values object', () => {
      const flags: FlagValues = {
        quiet: true,
        verbose: false,
        debug: true,
        help: false,
      }
      expect(isQuiet(flags)).toBe(true)
      expect(isVerbose(flags)).toBe(false)
      expect(isDebug(flags)).toBe(true)
      expect(isHelp(flags)).toBe(false)
    })

    it('should accept all flag properties', () => {
      const flags: FlagValues = {
        all: true,
        changed: true,
        coverage: true,
        cover: true,
        debug: true,
        'dry-run': true,
        fix: true,
        force: true,
        help: true,
        json: true,
        quiet: true,
        silent: true,
        staged: true,
        update: true,
        verbose: true,
        watch: true,
      }
      expect(isAll(flags)).toBe(true)
      expect(isChanged(flags)).toBe(true)
      expect(isCoverage(flags)).toBe(true)
      expect(isDebug(flags)).toBe(true)
      expect(isDryRun(flags)).toBe(true)
      expect(isFix(flags)).toBe(true)
      expect(isForce(flags)).toBe(true)
      expect(isHelp(flags)).toBe(true)
      expect(isJson(flags)).toBe(true)
      expect(isQuiet(flags)).toBe(true)
      expect(isStaged(flags)).toBe(true)
      expect(isUpdate(flags)).toBe(true)
      expect(isVerbose(flags)).toBe(true)
      expect(isWatch(flags)).toBe(true)
    })
  })
})
