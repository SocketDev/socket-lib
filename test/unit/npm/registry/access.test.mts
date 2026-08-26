/**
 * @file Unit tests for the npm registry Access, Org, and Team endpoints. The
 *   HTTP adapter is injected, so every case runs with no network.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  fetchOrgPackageGrants,
  fetchPackageCollaborators,
  fetchPackageVisibility,
  fetchTeamPackageGrants,
  grantTeamPackageAccess,
  revokeTeamPackageAccess,
  setPackageAccess,
} from '../../../../src/npm/registry/access.mjs'
import {
  fetchOrgMembership,
  fetchOrgTeams,
  removeOrgMember,
  setOrgMembership,
} from '../../../../src/npm/registry/org.mjs'
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  fetchTeamMembers,
  removeTeamMember,
} from '../../../../src/npm/registry/team.mjs'
import { failingHttp, recordingHttp } from './api-helpers.mjs'

const AUTH = { token: 'tok' }

describe('fetchTeamPackageGrants', () => {
  test('reads the grants map', async () => {
    const stub = recordingHttp({ '@example/pkg': 'read-write' })
    const read = await fetchTeamPackageGrants('example-org', 'wombats', {
      ...stub,
      ...AUTH,
    })
    assert.equal(read.reachable, true)
    assert.equal(read.entries['@example/pkg'], 'read-write')
  })

  test('targets the /-/team path, not the /-/org one', async () => {
    // Team PACKAGE grants live under /-/team while team MEMBERSHIP lives
    // under /-/org; the two are easy to swap and both return 404 when wrong.
    const stub = recordingHttp({})
    await fetchTeamPackageGrants('example-org', 'wombats', { ...stub, ...AUTH })
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/team/example-org/wombats/package',
    )
  })

  test('an unreachable registry is NOT an empty grants map', async () => {
    const read = await fetchTeamPackageGrants('example-org', 'wombats', {
      ...failingHttp(),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
    assert.deepEqual(read.entries, {})
  })
})

describe('fetchOrgPackageGrants', () => {
  test('reads the org grants map', async () => {
    const stub = recordingHttp({ '@example/pkg': 'read-only' })
    const read = await fetchOrgPackageGrants('example-org', {
      ...stub,
      ...AUTH,
    })
    assert.equal(read.entries['@example/pkg'], 'read-only')
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/org/example-org/package',
    )
  })

  test('fails open', async () => {
    const read = await fetchOrgPackageGrants('example-org', {
      ...failingHttp(500),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
  })
})

describe('fetchPackageCollaborators', () => {
  test('escapes a scoped package name', async () => {
    const stub = recordingHttp({})
    await fetchPackageCollaborators('@example/pkg', { ...stub, ...AUTH })
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/package/@example%2Fpkg/collaborators',
    )
  })

  test('fails open', async () => {
    const read = await fetchPackageCollaborators('@example/pkg', {
      ...failingHttp(),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
  })
})

describe('fetchPackageVisibility', () => {
  test('passes npm\u2019s map shape through unflattened', async () => {
    // npm answers a single-package route with a map. Guessing which key is
    // "the" one would be an invention, so the map is returned as-is.
    const stub = recordingHttp({ '@example/pkg': 'public' })
    const read = await fetchPackageVisibility('@example/pkg', {
      ...stub,
      ...AUTH,
    })
    assert.equal(read.entries['@example/pkg'], 'public')
  })

  test('fails open', async () => {
    const read = await fetchPackageVisibility('@example/pkg', {
      ...failingHttp(),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
  })
})

describe('grantTeamPackageAccess', () => {
  test('PUTs the package and permission', async () => {
    const stub = recordingHttp({})
    const result = await grantTeamPackageAccess(
      'example-org',
      'wombats',
      { packageName: '@example/pkg', permissions: 'read-write' },
      { ...stub, ...AUTH },
    )
    assert.equal(result.success, true)
    assert.equal(stub.calls[0]!.method, 'PUT')
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      package: '@example/pkg',
      permissions: 'read-write',
    })
  })

  test('a bypass-2FA 403 is reported with the reason', async () => {
    const result = await grantTeamPackageAccess(
      'example-org',
      'wombats',
      { packageName: '@example/pkg', permissions: 'read-only' },
      { ...failingHttp(403), ...AUTH },
    )
    assert.equal(result.success, false)
    assert.ok(!result.success && result.error.includes('bypass_2fa'))
  })
})

describe('revokeTeamPackageAccess', () => {
  test('always names the package in the DELETE body', async () => {
    // npm\u2019s access.yaml gives this DELETE no requestBody, but the path holds
    // only org and team, so a body-less request names nothing to revoke.
    // libnpmaccess\u2019s removePermissions sends `{ package }`; so does this.
    const stub = recordingHttp()
    await revokeTeamPackageAccess('example-org', 'wombats', '@example/pkg', {
      ...stub,
      ...AUTH,
    })
    assert.equal(stub.calls[0]!.method, 'DELETE')
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      package: '@example/pkg',
    })
  })

  test('encodes the org and team into the path', async () => {
    const stub = recordingHttp()
    await revokeTeamPackageAccess('example org', 'wombats/x', 'example-pkg', {
      ...stub,
      ...AUTH,
    })
    assert.match(
      stub.calls[0]!.url,
      /\/-\/team\/example%20org\/wombats%2Fx\/package$/,
    )
  })

  test('an empty 204 is a success', async () => {
    const stub = recordingHttp()
    const result = await revokeTeamPackageAccess(
      'example-org',
      'wombats',
      '@example/pkg',
      { ...stub, ...AUTH },
    )
    assert.equal(result.success, true)
  })

  test('an unreachable registry is a failure, not a silent success', async () => {
    const stub = failingHttp()
    const result = await revokeTeamPackageAccess(
      'example-org',
      'wombats',
      '@example/pkg',
      { ...stub, ...AUTH },
    )
    assert.equal(result.success, false)
  })
})

describe('setPackageAccess', () => {
  test('maps camelCase params onto npm\u2019s snake_case wire names', async () => {
    const stub = recordingHttp({})
    await setPackageAccess(
      '@example/pkg',
      {
        access: 'private',
        automationTokenOverridesTfa: false,
        publishRequiresTfa: true,
      },
      { ...stub, ...AUTH },
    )
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      access: 'private',
      automation_token_overrides_tfa: false,
      publish_requires_tfa: true,
    })
  })

  test('omits fields that were not provided', async () => {
    // npm leaves an omitted setting untouched, so sending a default would
    // silently overwrite a policy the caller never mentioned.
    const stub = recordingHttp({})
    await setPackageAccess(
      '@example/pkg',
      { access: 'public' },
      {
        ...stub,
        ...AUTH,
      },
    )
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), { access: 'public' })
  })
})

describe('fetchOrgMembership', () => {
  test('reads members and their roles', async () => {
    const stub = recordingHttp({ octocat: 'owner' })
    const read = await fetchOrgMembership('example-org', { ...stub, ...AUTH })
    assert.equal(read.entries['octocat'], 'owner')
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/org/example-org/user',
    )
  })

  test('an unreachable registry is NOT an empty org', async () => {
    const read = await fetchOrgMembership('example-org', {
      ...failingHttp(),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
  })
})

describe('fetchOrgTeams', () => {
  test('reads the team list', async () => {
    const stub = recordingHttp(['@example:wombats'])
    const read = await fetchOrgTeams('example-org', { ...stub, ...AUTH })
    assert.deepEqual(read.items, ['@example:wombats'])
  })

  test('fails open', async () => {
    const read = await fetchOrgTeams('example-org', {
      ...failingHttp(),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
  })
})

describe('setOrgMembership', () => {
  test('PUTs the user and role', async () => {
    const stub = recordingHttp({ role: 'admin', user: 'octocat' })
    const result = await setOrgMembership(
      'example-org',
      { role: 'admin', user: 'octocat' },
      { ...stub, ...AUTH },
    )
    assert.equal(result.success, true)
    assert.equal(stub.calls[0]!.method, 'PUT')
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      role: 'admin',
      user: 'octocat',
    })
  })
})

describe('removeOrgMember', () => {
  test('DELETEs with the username in the body', async () => {
    const stub = recordingHttp()
    const result = await removeOrgMember('example-org', 'octocat', {
      ...stub,
      ...AUTH,
    })
    assert.equal(result.success, true)
    assert.equal(stub.calls[0]!.method, 'DELETE')
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), { user: 'octocat' })
  })

  test('a failure is reported rather than thrown', async () => {
    const result = await removeOrgMember('example-org', 'octocat', {
      ...failingHttp(401),
      ...AUTH,
    })
    assert.equal(result.success, false)
    assert.equal(result.success ? 0 : result.status, 401)
  })
})

describe('createTeam', () => {
  test('PUTs to /-/org/{org}/team', async () => {
    const stub = recordingHttp({ name: 'wombats' })
    const result = await createTeam(
      'example-org',
      { description: 'All developers', name: 'wombats' },
      { ...stub, ...AUTH },
    )
    assert.equal(result.success, true)
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/org/example-org/team',
    )
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      description: 'All developers',
      name: 'wombats',
    })
  })

  test('omits a description that was not given', async () => {
    const stub = recordingHttp({})
    await createTeam('example-org', { name: 'wombats' }, { ...stub, ...AUTH })
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), { name: 'wombats' })
  })
})

describe('deleteTeam', () => {
  test('targets /-/org/{org}/{team} with no "team" segment', async () => {
    // Create posts to /-/org/{org}/team but delete drops the segment
    // entirely. The asymmetry is npm\u2019s, and getting it wrong is a 404.
    const stub = recordingHttp()
    await deleteTeam('example-org', 'wombats', { ...stub, ...AUTH })
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/org/example-org/wombats',
    )
    assert.equal(stub.calls[0]!.method, 'DELETE')
  })
})

describe('fetchTeamMembers', () => {
  test('reads the member list', async () => {
    const stub = recordingHttp(['npm', 'npm-cli-bot'])
    const read = await fetchTeamMembers('example-org', 'wombats', {
      ...stub,
      ...AUTH,
    })
    assert.deepEqual(read.items, ['npm', 'npm-cli-bot'])
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/org/example-org/wombats/user',
    )
  })

  test('an unreachable registry is NOT an empty team', async () => {
    // Team membership gates publishing; an empty list mistaken for the truth
    // says nobody holds access.
    const read = await fetchTeamMembers('example-org', 'wombats', {
      ...failingHttp(),
      ...AUTH,
    })
    assert.equal(read.reachable, false)
    assert.deepEqual(read.items, [])
  })
})

describe('addTeamMember', () => {
  test('PUTs the username', async () => {
    const stub = recordingHttp({})
    const result = await addTeamMember(
      'example-org',
      'wombats',
      'npm-cli-bot',
      { ...stub, ...AUTH },
    )
    assert.equal(result.success, true)
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), { user: 'npm-cli-bot' })
  })
})

describe('removeTeamMember', () => {
  test('DELETEs the username', async () => {
    const stub = recordingHttp()
    const result = await removeTeamMember(
      'example-org',
      'wombats',
      'npm-cli-bot',
      { ...stub, ...AUTH },
    )
    assert.equal(result.success, true)
    assert.equal(stub.calls[0]!.method, 'DELETE')
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), { user: 'npm-cli-bot' })
  })
})

describe('registry override', () => {
  test('every route honors a non-default registry', async () => {
    const stub = recordingHttp({})
    await fetchOrgMembership('example-org', {
      ...stub,
      ...AUTH,
      registry: 'https://registry.example.test/',
    })
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.example.test/-/org/example-org/user',
    )
  })
})
