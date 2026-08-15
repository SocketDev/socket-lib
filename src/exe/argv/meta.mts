/**
 * @file The CLI self-description contract: every Socket product CLI answers
 *   `--describe` with a one-line purpose and `--describe --json` with a
 *   machine-readable manifest of its commands and flags, before any side
 *   effect. The manifest's field vocabulary aligns with MCP tool descriptors
 *   so a CLI can be bridged into an MCP server without a mapping layer; the
 *   canonical JSON Schema lives in socket-wheelhouse under
 *   `schemas/cli-describe.schema.json`. This module owns the types, the argv
 *   sniff, and the renderer — a bin wires it in one guard clause at the top
 *   of its entry, mirroring how the fleet script runner answers `--describe`
 *   ahead of `main()`.
 */

/**
 * One flag in a CLI manifest. `type` is the parsed value's shape; optionals
 * are omitted rather than carried as null so the JSON stays lean.
 */
export interface CliFlagMeta {
  readonly choices?: readonly string[] | undefined
  readonly default?: boolean | number | string | undefined
  readonly description: string
  readonly hidden?: boolean | undefined
  readonly name: string
  readonly short?: string | undefined
  readonly type: 'boolean' | 'number' | 'string'
}

/**
 * One command in a CLI manifest. Hidden commands ARE included — the manifest
 * is the honest contract a caller can rely on, unlike `--help` which curates.
 */
export interface CliCommandMeta {
  readonly aliases?: readonly string[] | undefined
  readonly commands?: readonly CliCommandMeta[] | undefined
  readonly description: string
  readonly flags?: readonly CliFlagMeta[] | undefined
  readonly hidden?: boolean | undefined
  readonly name: string
}

/**
 * The `--describe --json` payload: a self-describing envelope naming the
 * tool, its version, and its full command tree.
 */
export interface CliManifest {
  readonly $schema: string
  readonly commands?: readonly CliCommandMeta[] | undefined
  readonly description: string
  readonly flags?: readonly CliFlagMeta[] | undefined
  readonly name: string
  readonly version: string
}

/**
 * The canonical `$schema` URL every manifest carries.
 */
export const CLI_DESCRIBE_SCHEMA_URL =
  'https://raw.githubusercontent.com/SocketDev/socket-wheelhouse/main/schemas/cli-describe.schema.json'

/**
 * Build a manifest from its parts, stamping the canonical `$schema`.
 */
export function buildCliManifest(
  parts: Omit<CliManifest, '$schema'>,
): CliManifest {
  return { $schema: CLI_DESCRIBE_SCHEMA_URL, ...parts }
}

/**
 * The describe request found on argv, if any: `'json'` when `--json` rides
 * along, `'text'` for the bare flag, undefined when absent. Pure — pass
 * `process.argv.slice(2)`.
 */
export function describeRequest(
  argv: readonly string[],
): 'json' | 'text' | undefined {
  if (!argv.includes('--describe')) {
    return undefined
  }
  return argv.includes('--json') ? 'json' : 'text'
}

/**
 * The text a describe request prints: the one-liner for `'text'`, the
 * manifest JSON for `'json'`. Pure; the caller owns the write and the exit.
 */
export function renderDescribe(
  kind: 'json' | 'text',
  manifest: CliManifest,
): string {
  return kind === 'json'
    ? `${JSON.stringify(manifest, undefined, 2)}\n`
    : `${manifest.description}\n`
}
