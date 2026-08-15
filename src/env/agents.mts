/**
 * @file AI coding-agent detection. Wraps std-env's `detectAgent()` (not
 *   reimplemented; std-env is a devDependency inlined by the bundler) behind
 *   callable predicates backed by a lazily-memoized detection, so the value is
 *   computed once and tests can mock the module or reset it via
 *   `vi.resetModules()`.
 */

import { detectAgent } from '../external/std-env.js'

import type { AgentInfo } from '../external/std-env.js'

export type { AgentInfo, AgentName } from '../external/std-env.js'

let detectedAgent: AgentInfo | undefined

/**
 * Returns the detected AI coding agent's info, memoized on first call.
 *
 * @example
 *   ;```typescript
 *   import { getAgent } from '@socketsecurity/lib/env/agents'
 *
 *   const { name } = getAgent() // e.g. 'claude-code', or undefined
 *   ```
 *
 * @returns The agent info; its `name` is `undefined` outside an agent-driven
 *   run.
 */
export function getAgent(): AgentInfo {
  if (detectedAgent === undefined) {
    detectedAgent = detectAgent()
  }
  return detectedAgent
}

/**
 * Returns whether this process is running under an AI coding agent.
 *
 * @example
 *   ;```typescript
 *   import { isAgent } from '@socketsecurity/lib/env/agents'
 *
 *   if (isAgent()) {
 *     console.log('Driven by an AI coding agent')
 *   }
 *   ```
 *
 * @returns `true` when an agent environment is detected, `false` otherwise
 */
export function isAgent(): boolean {
  return getAgent().name !== undefined
}
