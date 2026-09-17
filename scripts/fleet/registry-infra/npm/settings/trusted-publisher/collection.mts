import { PUBLISH_FIRST } from '../migrations.mts'
import type { TrustedPublisherDesired } from './plan.mts'

export interface TrustedPublisherBinding {
  environmentName: string | undefined
  id: string | undefined
  permissions: readonly string[]
  provider: string | undefined
  repository: string | undefined
  workflowFilename: string | undefined
}

export type TrustedPublisherTarget = TrustedPublisherDesired

const DIRECT_PERMISSION = 'createPackage'
const STAGED_PERMISSION = 'createStagedPackage'

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function bindingFromJson(value: unknown): TrustedPublisherBinding | undefined {
  const row = recordValue(value)
  if (!row) {
    return undefined
  }
  const claims = recordValue(row['claims'])
  const workflow = recordValue(claims?.['workflow_ref'])
  const permissions = row['permissions']
  if (
    !Array.isArray(permissions) ||
    permissions.some(permission => typeof permission !== 'string')
  ) {
    throw new Error(
      'npm trusted-publisher permissions are invalid. Where: npm trust list JSON. Saw: a missing or non-string permission; wanted a string array. Fix: inspect the registry response before changing publisher settings.',
    )
  }
  return {
    environmentName:
      stringValue(claims?.['environment']) ?? stringValue(row['environment']),
    id: stringValue(row['id']),
    permissions,
    provider: stringValue(row['type']),
    repository:
      stringValue(claims?.['repository']) ?? stringValue(row['repository']),
    workflowFilename:
      stringValue(workflow?.['file']) ?? stringValue(row['file']),
  }
}

function jsonPayload(output: string): unknown {
  const starts = [output.indexOf('['), output.indexOf('{')].filter(
    index => index >= 0,
  )
  const start = starts.length ? Math.min(...starts) : -1
  if (start < 0) {
    return undefined
  }
  try {
    return JSON.parse(output.slice(start)) as unknown
  } catch {
    return undefined
  }
}

function humanPermissions(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value.trim() === '') {
    return []
  }
  const lowered = value.toLowerCase().replaceAll('npm ', '')
  const remainder = lowered
    .replaceAll('stage publish', '')
    .replaceAll('publish', '')
    .replace(/[,+|\s]/gu, '')
  if (remainder !== '') {
    return undefined
  }
  const permissions: string[] = []
  if (/\bstage publish\b/.test(lowered)) {
    permissions.push(STAGED_PERMISSION)
  }
  if (/\bpublish\b/.test(lowered.replaceAll('stage publish', ''))) {
    permissions.push(DIRECT_PERMISSION)
  }
  return permissions
}

function bindingFromHuman(
  current: Record<string, string>,
): TrustedPublisherBinding {
  const permissions = humanPermissions(current['permissions'])
  if (permissions === undefined) {
    throw new Error(
      'npm trusted-publisher permissions are invalid. Where: npm trust list output. Saw: a missing or unknown permission; wanted npm stage publish with optional npm publish. Fix: inspect the registry response before changing publisher settings.',
    )
  }
  return {
    environmentName: current['environment'],
    id: current['id'],
    permissions,
    provider: current['type'],
    repository: current['repository'],
    workflowFilename: current['file'],
  }
}

export function parseTrustedPublisherBindings(
  output: string,
): TrustedPublisherBinding[] {
  const payload = jsonPayload(output)
  if (payload !== undefined) {
    const rows = Array.isArray(payload) ? payload : [payload]
    return rows
      .map(bindingFromJson)
      .filter((row): row is TrustedPublisherBinding => row !== undefined)
  }

  const bindings: TrustedPublisherBinding[] = []
  let current: Record<string, string> | undefined
  const plain = output
    .replace(/\u001B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/[\u2800-\u28FF\r]/g, '')
  const lines = plain.split(/\n/)
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    // One supported npm display key, a colon, then its value.
    const match =
      /^\s*(environment|file|id|permissions|repository|type):\s*(.*?)\s*$/.exec(
        line,
      )
    if (!match) {
      continue
    }
    if (match[1] === 'type') {
      if (current) {
        bindings.push(bindingFromHuman(current))
      }
      current = Object.create(null) as Record<string, string>
    }
    current ??= Object.create(null) as Record<string, string>
    current[match[1]!] = match[2]!
  }
  if (current) {
    bindings.push(bindingFromHuman(current))
  }
  return bindings
}

export function trustedPublisherBindingMatches(
  binding: TrustedPublisherBinding,
  target: TrustedPublisherTarget,
): boolean {
  const permissions = new Set(binding.permissions)
  return (
    binding.provider === 'github' &&
    binding.repository ===
      `${target.repositoryOwner}/${target.repositoryName}` &&
    binding.workflowFilename === target.workflowFilename &&
    binding.environmentName === target.environmentName &&
    permissions.has(STAGED_PERMISSION) &&
    permissions.has(DIRECT_PERMISSION) === target.allowNpmPublish &&
    [...permissions].every(
      permission =>
        permission === DIRECT_PERMISSION || permission === STAGED_PERMISSION,
    )
  )
}

export function supersededTrustedPublisherBindings(
  bindings: readonly TrustedPublisherBinding[],
  target: TrustedPublisherTarget,
  legacyWorkflowFilenames: readonly string[],
): TrustedPublisherBinding[] {
  const repository = `${target.repositoryOwner}/${target.repositoryName}`
  const legacy = new Set(legacyWorkflowFilenames)
  return bindings.filter(
    binding =>
      binding.provider === 'github' &&
      binding.repository === repository &&
      binding.workflowFilename !== undefined &&
      ((binding.workflowFilename === target.workflowFilename &&
        !trustedPublisherBindingMatches(binding, target)) ||
        (legacy.has(binding.workflowFilename) &&
          (binding.workflowFilename === 'npm-publish.yml' ||
            !Object.hasOwn(PUBLISH_FIRST.workflows, binding.workflowFilename) ||
            PUBLISH_FIRST.workflows[binding.workflowFilename] ===
              target.workflowFilename))),
  )
}
