// vitest specs for the shared trust-gate / npmrc-trust detectors consumed by
// the trust-downgrade-guard + npmrc-trust-optout-guard hooks AND the
// trust-gates-are-not-weakened.mts commit-time check. Testing the pure
// functions here proves the shared logic both surfaces rely on; the hooks have
// their own spawn-level node --test specs for the dispatch wiring.

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
  detectAuthEnvPlaceholderInNpmrc,
  detectOptoutInCommands,
  detectOptoutInFileText,
} from '../../../.claude/hooks/fleet/_shared/npmrc-trust.mts'
import { parseCommands } from '../../../.claude/hooks/fleet/_shared/shell-command.mts'
import {
  checkGateFloors,
  detectNpmrcMinReleaseAgeDowngrade,
  MIN_RELEASE_AGE_DAYS,
  MIN_RELEASE_AGE_MINUTES,
} from '../../../.claude/hooks/fleet/_shared/trust-gates.mts'

describe('checkGateFloors', () => {
  const STRONG = `minimumReleaseAge: ${MIN_RELEASE_AGE_MINUTES}
trustPolicy: no-downgrade
blockExoticSubdeps: true
`

  test('a fully-strong pnpm-workspace.yaml has no violations', () => {
    assert.deepEqual(checkGateFloors(STRONG, undefined), [])
  })

  test('flags a lowered minimumReleaseAge', () => {
    const v = checkGateFloors(STRONG.replace('10080', '60'), undefined)
    assert.equal(v.length, 1)
    assert.equal(v[0]!.gate, 'minimumReleaseAge')
    assert.equal(v[0]!.saw, '60')
  })

  test('flags an absent minimumReleaseAge', () => {
    const v = checkGateFloors(
      'trustPolicy: no-downgrade\nblockExoticSubdeps: true\n',
      undefined,
    )
    assert.ok(v.some(x => x.gate === 'minimumReleaseAge' && x.saw === 'absent'))
  })

  test('flags a non-no-downgrade trustPolicy', () => {
    const v = checkGateFloors(STRONG.replace('no-downgrade', 'trust-all'), undefined)
    assert.ok(v.some(x => x.gate === 'trustPolicy' && x.saw === 'trust-all'))
  })

  test('flags blockExoticSubdeps flipped to false', () => {
    const v = checkGateFloors(STRONG.replace('true', 'false'), undefined)
    assert.ok(v.some(x => x.gate === 'blockExoticSubdeps' && x.saw === 'false'))
  })

  test('flags .npmrc min-release-age below the day floor', () => {
    const v = checkGateFloors(STRONG, 'min-release-age=1\n')
    assert.ok(v.some(x => x.gate === 'min-release-age' && x.saw === '1'))
  })

  test('an absent .npmrc min-release-age is allowed (pnpm gate is primary)', () => {
    assert.deepEqual(checkGateFloors(STRONG, 'ignore-scripts=true\n'), [])
  })
})

describe('detectNpmrcMinReleaseAgeDowngrade', () => {
  test('flags lowering below the floor', () => {
    assert.ok(detectNpmrcMinReleaseAgeDowngrade('min-release-age=7', 'min-release-age=0'))
  })

  test('flags removing the key', () => {
    assert.ok(detectNpmrcMinReleaseAgeDowngrade('min-release-age=7', 'ignore-scripts=true'))
  })

  test('allows raising the value', () => {
    assert.equal(
      detectNpmrcMinReleaseAgeDowngrade('min-release-age=7', 'min-release-age=14'),
      undefined,
    )
  })

  test('allows the floor value', () => {
    assert.equal(
      detectNpmrcMinReleaseAgeDowngrade('', `min-release-age=${MIN_RELEASE_AGE_DAYS}`),
      undefined,
    )
  })
})

describe('detectOptoutInCommands', () => {
  const found = (cmd: string) => [...detectOptoutInCommands(parseCommands(cmd))].toSorted()

  test('detects a prefix assignment', () => {
    assert.deepEqual(found('PNPM_CONFIG_NPMRC_AUTH_FILE=.npmrc pnpm i'), [
      'PNPM_CONFIG_NPMRC_AUTH_FILE',
    ])
  })

  test('detects export', () => {
    assert.deepEqual(found('export NPM_CONFIG_USERCONFIG=.npmrc'), [
      'NPM_CONFIG_USERCONFIG',
    ])
  })

  test('detects a bare repo-relative assignment', () => {
    assert.deepEqual(found('NPM_CONFIG_USERCONFIG=./.npmrc'), [
      'NPM_CONFIG_USERCONFIG',
    ])
  })

  test('ignores a HOME-pointed USERCONFIG', () => {
    assert.deepEqual(found('export NPM_CONFIG_USERCONFIG=~/.npmrc'), [])
  })

  test('ignores an absolute non-repo USERCONFIG', () => {
    assert.deepEqual(found('NPM_CONFIG_USERCONFIG=/etc/npmrc pnpm i'), [])
  })

  test('ignores /dev/null', () => {
    assert.deepEqual(found('NPM_CONFIG_USERCONFIG=/dev/null pnpm i'), [])
  })

  test('ignores an ordinary command', () => {
    assert.deepEqual(found('pnpm install'), [])
  })
})

describe('detectOptoutInFileText', () => {
  test('detects an export in a shell script', () => {
    const hits = detectOptoutInFileText('#!/bin/sh\nexport PNPM_CONFIG_NPMRC_AUTH_FILE=.npmrc\n')
    assert.equal(hits.length, 1)
    assert.equal(hits[0]!.name, 'PNPM_CONFIG_NPMRC_AUTH_FILE')
    assert.equal(hits[0]!.line, 2)
  })

  test('detects a YAML env assignment', () => {
    const hits = detectOptoutInFileText('env:\n  NPM_CONFIG_USERCONFIG: .npmrc\n')
    assert.equal(hits.length, 1)
  })

  test('ignores a HOME-pointed YAML value', () => {
    assert.deepEqual(detectOptoutInFileText('env:\n  NPM_CONFIG_USERCONFIG: ~/.npmrc\n'), [])
  })
})

describe('detectAuthEnvPlaceholderInNpmrc', () => {
  test('detects ${ENV} beside _authToken', () => {
    assert.deepEqual(
      detectAuthEnvPlaceholderInNpmrc('//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n'),
      [1],
    )
  })

  test('detects $ENV beside a registry key', () => {
    assert.deepEqual(detectAuthEnvPlaceholderInNpmrc('registry=$REG\n'), [1])
  })

  test('ignores a literal min-release-age line', () => {
    assert.deepEqual(detectAuthEnvPlaceholderInNpmrc('min-release-age=7\n'), [])
  })

  test('ignores a commented-out line', () => {
    assert.deepEqual(
      detectAuthEnvPlaceholderInNpmrc('# _authToken=${OLD}\nmin-release-age=7\n'),
      [],
    )
  })
})
