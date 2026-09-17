import { Buffer } from 'node:buffer'

import { rootPath, runCapture } from '../../../shared.mts'
import {
  SOCKET_REGISTRY_REPO_NAME,
  SOCKET_REGISTRY_REPO_OWNER,
  SOCKET_REGISTRY_SCOPE,
} from './plan.mts'

const BLOB_READ_CONCURRENCY = 8
const COMMIT_SHA_RE = /^[a-f0-9]{40}$/iu
const PACKAGE_MANIFEST_PATH_RE =
  /^packages\/npm\/[a-z0-9._-]+\/package\.json$/iu
const REPOSITORY = `${SOCKET_REGISTRY_REPO_OWNER}/${SOCKET_REGISTRY_REPO_NAME}`

type Capture = typeof runCapture

interface PackageBlob {
  path: string
  sha: string
}

interface OwnedPackageManifest {
  source: string
  text: string
}

interface ReadSocketRegistryWorklistOptions {
  readonly __proto__?: null | undefined
  capture?: Capture | undefined
}

export function parseSocketRegistryPackageManifests(
  manifests: readonly OwnedPackageManifest[],
): string[] {
  const names = new Set<string>()
  for (let i = 0, { length } = manifests; i < length; i += 1) {
    const manifest = manifests[i]!
    let parsed: unknown
    try {
      parsed = JSON.parse(manifest.text)
    } catch {
      throw new TypeError(
        `Socket Registry package manifest is invalid. Where: ${manifest.source}. Saw invalid JSON, wanted a package manifest. Fix: repair the owned manifest before changing trusted publishers.`,
      )
    }
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new TypeError(
        `Socket Registry package manifest is invalid. Where: ${manifest.source}. Saw a non-object value, wanted a package manifest. Fix: repair the owned manifest before changing trusted publishers.`,
      )
    }
    const record = parsed as Record<string, unknown>
    if (record['private'] === true) {
      continue
    }
    const name = record['name']
    const version = record['version']
    if (
      typeof name !== 'string' ||
      !name.startsWith(SOCKET_REGISTRY_SCOPE) ||
      typeof version !== 'string' ||
      version.length === 0
    ) {
      throw new TypeError(
        `Socket Registry package manifest is not publishable. Where: ${manifest.source}. Saw a missing family name or version, wanted a non-private @socketregistry package. Fix: correct the owned manifest before changing trusted publishers.`,
      )
    }
    if (names.has(name)) {
      throw new TypeError(
        `Socket Registry package ownership is ambiguous. Where: ${manifest.source}. Saw duplicate package ${name}, wanted one owning manifest. Fix: remove the duplicate before changing trusted publishers.`,
      )
    }
    names.add(name)
  }
  if (names.size === 0) {
    throw new TypeError(
      'Socket Registry package worklist is empty. Where: packages/npm. Saw no non-private family manifests, wanted owned package entries. Fix: restore the owned manifests before changing trusted publishers.',
    )
  }
  return [...names].toSorted()
}

function parseJsonObject(body: string, where: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new TypeError(
      `Socket Registry evidence is invalid. Where: ${where}. Saw invalid JSON, wanted a GitHub API object. Fix: verify GitHub access and retry.`,
    )
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError(
      `Socket Registry evidence is invalid. Where: ${where}. Saw a non-object value, wanted a GitHub API object. Fix: verify GitHub access and retry.`,
    )
  }
  return parsed as Record<string, unknown>
}

export function parseSocketRegistryRevision(body: string): string {
  const sha = parseJsonObject(body, `${REPOSITORY} HEAD commit`)['sha']
  if (typeof sha !== 'string' || !COMMIT_SHA_RE.test(sha)) {
    throw new TypeError(
      `Socket Registry revision is invalid. Where: ${REPOSITORY} HEAD commit. Saw a missing or invalid SHA, wanted a 40-character commit SHA. Fix: verify the repository response and retry.`,
    )
  }
  return sha
}

export function parseSocketRegistryPackageBlobs(body: string): PackageBlob[] {
  const parsed = parseJsonObject(body, `${REPOSITORY} commit tree`)
  if (parsed['truncated'] !== false || !Array.isArray(parsed['tree'])) {
    throw new TypeError(
      `Socket Registry tree is incomplete. Where: ${REPOSITORY} commit tree. Saw a truncated or invalid tree, wanted the complete recursive tree. Fix: retry with readable immutable evidence.`,
    )
  }
  const blobs: PackageBlob[] = []
  const paths = new Set<string>()
  for (const entry of parsed['tree']) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }
    const record = entry as Record<string, unknown>
    const path = record['path']
    const sha = record['sha']
    if (typeof path !== 'string' || !PACKAGE_MANIFEST_PATH_RE.test(path)) {
      continue
    }
    if (
      record['type'] !== 'blob' ||
      typeof sha !== 'string' ||
      !COMMIT_SHA_RE.test(sha) ||
      paths.has(path)
    ) {
      throw new TypeError(
        `Socket Registry tree is ambiguous. Where: ${path}. Saw a duplicate path or invalid blob SHA, wanted one immutable package manifest. Fix: inspect the commit tree before changing trusted publishers.`,
      )
    }
    paths.add(path)
    blobs.push({ path, sha })
  }
  if (blobs.length === 0) {
    throw new TypeError(
      `Socket Registry tree has no packages. Where: ${REPOSITORY} packages/npm. Saw no owned manifest blobs, wanted package entries. Fix: verify the immutable commit tree and retry.`,
    )
  }
  return blobs.toSorted((left, right) => left.path.localeCompare(right.path))
}

function parseBlobContent(body: string, source: string): string {
  const parsed = parseJsonObject(body, source)
  const content = parsed['content']
  if (
    parsed['encoding'] !== 'base64' ||
    typeof content !== 'string' ||
    content.length === 0
  ) {
    throw new TypeError(
      `Socket Registry manifest blob is invalid. Where: ${source}. Saw missing content, wanted a base64 package manifest. Fix: verify the immutable blob and retry.`,
    )
  }
  return Buffer.from(content.replace(/\s+/gu, ''), 'base64').toString('utf8')
}

async function readApi(endpoint: string, capture: Capture): Promise<string> {
  const result = await capture('gh', ['api', endpoint], rootPath)
  if (result.code !== 0 || !result.stdout.trim()) {
    throw new Error(
      `Socket Registry evidence is unreadable. Where: GitHub API ${endpoint}. Saw exit ${result.code} or an empty body, wanted immutable repository data. Fix: verify GitHub access and retry.`,
    )
  }
  return result.stdout
}

async function readPackageManifests(
  blobs: readonly PackageBlob[],
  capture: Capture,
): Promise<OwnedPackageManifest[]> {
  const manifests: OwnedPackageManifest[] = []
  let next = 0
  async function work(): Promise<void> {
    for (;;) {
      const index = next
      next += 1
      if (index >= blobs.length) {
        return
      }
      const blob = blobs[index]!
      const endpoint = `repos/${REPOSITORY}/git/blobs/${blob.sha}`
      const body = await readApi(endpoint, capture)
      manifests[index] = {
        source: `${REPOSITORY}@${blob.sha}:${blob.path}`,
        text: parseBlobContent(body, endpoint),
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(BLOB_READ_CONCURRENCY, blobs.length) },
    () => work(),
  )
  await Promise.all(workers)
  return manifests
}

export async function readSocketRegistryWorklist(
  options?: ReadSocketRegistryWorklistOptions | undefined,
): Promise<string[]> {
  const config: ReadSocketRegistryWorklistOptions = {
    __proto__: null,
    ...options,
  }
  const capture = config.capture ?? runCapture
  const commitBody = await readApi(`repos/${REPOSITORY}/commits/HEAD`, capture)
  const revision = parseSocketRegistryRevision(commitBody)
  const treeBody = await readApi(
    `repos/${REPOSITORY}/git/trees/${revision}?recursive=1`,
    capture,
  )
  const blobs = parseSocketRegistryPackageBlobs(treeBody)
  const manifests = await readPackageManifests(blobs, capture)
  return parseSocketRegistryPackageManifests(manifests)
}
