/**
 * @file Unit tests for src/exe/argv/meta — the CLI self-description contract:
 *   the argv sniff, the manifest builder's canonical $schema stamp, and the
 *   text/json renderers.
 */

import { describe, expect, it } from 'vitest'

import {
  buildCliManifest,
  describeRequest,
  renderDescribe,
} from '../../../../src/exe/argv/meta.mjs'

// The canonical $schema url, spelled out rather than imported so the
// assertion pins the published contract, not whatever the constant drifts to.
const SCHEMA_URL =
  'https://raw.githubusercontent.com/SocketDev/socket-wheelhouse/main/schemas/cli-describe.schema.json'

const MANIFEST = buildCliManifest({
  name: 'widget',
  version: '1.2.3',
  description: 'Frobs widgets from the terminal',
  commands: [
    {
      name: 'frob',
      description: 'Frob one widget',
      flags: [
        {
          name: 'json',
          type: 'boolean',
          default: false,
          description: 'Output as JSON',
        },
      ],
    },
  ],
})

describe('describeRequest', () => {
  it('returns undefined when --describe is absent', () => {
    expect(describeRequest([])).toBe(undefined)
    expect(describeRequest(['frob', '--json'])).toBe(undefined)
  })

  it('returns text for a bare --describe, anywhere on argv', () => {
    expect(describeRequest(['--describe'])).toBe('text')
    expect(describeRequest(['frob', '--describe'])).toBe('text')
  })

  it('returns json when --json rides along, in either order', () => {
    expect(describeRequest(['--describe', '--json'])).toBe('json')
    expect(describeRequest(['--json', '--describe'])).toBe('json')
  })
})

describe('buildCliManifest', () => {
  it('stamps the canonical $schema url', () => {
    expect(MANIFEST.$schema).toBe(SCHEMA_URL)
    expect(MANIFEST.name).toBe('widget')
  })
})

describe('renderDescribe', () => {
  it('renders the one-liner for text', () => {
    expect(renderDescribe('text', MANIFEST)).toBe(
      'Frobs widgets from the terminal\n',
    )
  })

  it('renders one parseable JSON document for json', () => {
    const out = renderDescribe('json', MANIFEST)
    expect(out.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(out) as {
      $schema: string
      commands: Array<{ flags: Array<{ name: string }>; name: string }>
    }
    expect(parsed.$schema).toBe(SCHEMA_URL)
    expect(parsed.commands[0]?.name).toBe('frob')
    expect(parsed.commands[0]?.flags[0]?.name).toBe('json')
  })
})
