/**
 * @file Detect which AI agent CLIs are installed on PATH. Strategy:
 *   which()-based lookup with a two-tier cache:
 *
 *   1. In-process Map — survives until the Node process exits.
 *   2. On-disk JSON at `<repo>/.cache/agent-discovery.json`, TTL 1h — survives
 *      across subprocess invocations (per-file ai-lint-fix batches) without
 *      re-running which(). Cache invalidation: stale on-disk cache is detected
 *      by mtime comparison; missing or expired → fresh which() pass + rewrite.
 *      Why two tiers: hooks and skills spawn dozens of short-lived Node
 *      processes per session. In-process alone misses the cross-process
 *      speedup; on-disk alone hits the filesystem on every call. The
 *      combination keeps repeated lookups under a millisecond after the
 *      cold-start cost.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { whichSync } from '../bin/which'
import { errorMessage } from '../errors/message'
import { getDefaultLogger } from '../logger/default'
import { JSONParse, JSONStringify } from '../primordials/json'

const logger = getDefaultLogger()

import type { AiAgentName, DiscoveredAgents } from './types.mts'

import { DateNow } from '../primordials/date'

const KNOWN_AGENTS: readonly AiAgentName[] = [
  'claude',
  'codex',
  'gemini',
  'opencode',
]

/**
 * Cache TTL in milliseconds (1 hour).
 */
const CACHE_TTL_MS = 60 * 60 * 1000

let inProcessCache: DiscoveredAgents | undefined

interface OnDiskCache {
  readonly agents: DiscoveredAgents
  readonly writtenAt: number
}

export function cachePathFor(repoRoot: string): string {
  return path.join(repoRoot, '.cache', 'agent-discovery.json')
}

/**
 * Discover which AI agent CLIs are installed.
 *
 * @param options.repoRoot - Where to read/write the on-disk cache. Defaults to
 *   process.cwd(). Skill runners typically pass the target repo's root.
 * @param options.refresh - When true, bypass both caches and re-run which().
 *   Useful after `npm i -g <agent>` mid-session.
 *
 *   Returns a map of agent → absolute binary path. Agents that aren't installed
 *   are absent from the map (not present-with-undefined), so callers can use
 *   `'claude' in agents` for the existence check.
 */
export async function discoverAiAgents(
  options: {
    readonly refresh?: boolean | undefined
    readonly repoRoot?: string | undefined
  } = {},
): Promise<DiscoveredAgents> {
  const { refresh = false, repoRoot = process.cwd() } = options

  if (!refresh && inProcessCache) {
    return inProcessCache
  }

  const cachePath = cachePathFor(repoRoot)

  if (!refresh) {
    const fromDisk = readDiskCache(cachePath)
    if (fromDisk) {
      inProcessCache = fromDisk
      return fromDisk
    }
  }

  const fresh = discoverFresh()
  inProcessCache = fresh
  await writeDiskCache(cachePath, fresh)
  return fresh
}

export function discoverFresh(): DiscoveredAgents {
  const out: { -readonly [K in AiAgentName]?: string } = {}
  for (let i = 0, { length } = KNOWN_AGENTS; i < length; i += 1) {
    const name = KNOWN_AGENTS[i]!
    const found = whichSync(name)
    if (typeof found === 'string' && found) {
      out[name] = found
    }
  }
  return out
}

/**
 * Synchronous in-process lookup. Skips disk cache + which(). Returns undefined
 * if discoverAiAgents() hasn't been called yet in this process, OR returns the
 * most recent discovery result.
 *
 * Useful in fast paths where the caller has already populated the cache and
 * just wants to read it back.
 */
export function getDiscoveredAiAgents(): DiscoveredAgents | undefined {
  return inProcessCache
}

export function readDiskCache(cachePath: string): DiscoveredAgents | undefined {
  if (!existsSync(cachePath)) {
    return undefined
  }
  try {
    const raw = readFileSync(cachePath, 'utf8')
    const parsed = JSONParse(raw) as OnDiskCache
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.writtenAt !== 'number' ||
      DateNow() - parsed.writtenAt > CACHE_TTL_MS
    ) {
      return undefined
    }
    return parsed.agents
  } catch {
    // Malformed cache — treat as miss.
    return undefined
  }
}

/**
 * Reset the in-process cache. Tests use this; production callers shouldn't need
 * it (use `refresh: true` on discoverAiAgents()).
 */
export function resetAiAgentDiscoveryCache(): void {
  inProcessCache = undefined
}

export async function writeDiskCache(
  cachePath: string,
  agents: DiscoveredAgents,
): Promise<void> {
  try {
    await mkdir(path.dirname(cachePath), { recursive: true })
    const payload: OnDiskCache = { agents, writtenAt: DateNow() }
    writeFileSync(cachePath, JSONStringify(payload, undefined, 2) + '\n')
  } catch (e) {
    // Cache-write failure is non-fatal — discovery still works for
    // the current process via the in-process cache.
    logger.error(`discoverAiAgents: cache write failed (${errorMessage(e)})`)
  }
}
