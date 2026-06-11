/**
 * @file Multi-agent CLI backend registry + role routing. The fleet's review /
 *   scan / fix skills delegate work to whichever agent CLIs are installed
 *   (`codex`, `claude`, `kimi`, `opencode`), falling back through a per-role
 *   preference order and skipping a pass when nothing usable is present. Before
 *   this module each skill copied the same registry + detection block inline
 *   (the canonical copy lived in
 *   `.claude/skills/fleet/reviewing-code/run.mts`); the shared policy doc
 *   (`_shared/multi-agent-backends.md`) flagged the extraction. Import
 *   `BACKENDS` / `detectAvailableBackends` / `resolveBackendForRole` here
 *   instead so a new backend or a routing-policy change is a single edit. The
 *   registry is prompt-agnostic: it owns WHICH CLI runs and HOW its argv is
 *   built ({ argv, outMode }), not WHAT to ask. A skill keeps its own role
 *   table (prompts + per-role `preferenceOrder` + timeouts) and passes the
 *   order into `resolveBackendForRole`. Detection uses `which` (cross-platform)
 *   rather than `command -v` under `shell: true`, which mangles on Windows. The
 *   resolver is pure — it returns a structured result (chosen backend + why)
 *   and never logs, so the caller decides how to surface a fallback or a skip.
 *   `opencode` is hybrid (it dispatches to whatever provider its own config
 *   selects, e.g. Fireworks / Synthetic), so it is NEVER auto-picked from a
 *   preference order — only when a caller names it explicitly — to keep model
 *   attribution accurate.
 */

import { which } from '../bin/which'

/**
 * A CLI backend the fleet can delegate a pass to.
 */
export type BackendName = 'claude' | 'codex' | 'kimi' | 'opencode'

/**
 * How a backend's process emits its result.
 */
export type BackendOutMode = 'file' | 'stdout'

export interface BackendRun {
  readonly argv: readonly string[]
  readonly outMode: BackendOutMode
}

export interface BackendDescriptor {
  readonly bin: string
  // A hybrid backend dispatches to a provider chosen by its OWN config
  // (opencode → Fireworks / Synthetic / …), so model attribution is indirect.
  // Hybrid backends are never auto-picked from a preference order.
  readonly hybrid: boolean
  readonly name: BackendName
  // Build the CLI argv given a prompt-file path and the temp output path the
  // caller reads after the process exits. A backend that emits to stdout
  // returns `outMode: 'stdout'` so the caller captures stdout into the output
  // path itself; one that writes the file directly returns `outMode: 'file'`.
  readonly run: (promptFile: string, outFile: string) => BackendRun
}

// Env-var conventions are shared fleet-wide (see _shared/multi-agent-backends.md):
// pair a model with its effort knob where the backend has one. Kimi / opencode
// have no effort flag and inherit their CLI default.
export const BACKENDS: Readonly<Record<BackendName, BackendDescriptor>> = {
  __proto__: null,
  claude: {
    bin: 'claude',
    hybrid: false,
    name: 'claude',
    run(_promptFile: string, _outFile: string): BackendRun {
      const model = process.env['CLAUDE_MODEL'] ?? 'opus'
      const effort = process.env['CLAUDE_EFFORT'] ?? 'high'
      // Programmatic-Claude lockdown — all four flags (tools / allowedTools /
      // disallowedTools / permission-mode) per CLAUDE.md. The caller layers any
      // skill-specific tool allowlist on top; this is the read-only-safe floor.
      return {
        argv: [
          '--print',
          '--model',
          model,
          '--effort',
          effort,
          '--no-session-persistence',
          '--permission-mode',
          'dontAsk',
        ],
        outMode: 'stdout',
      }
    },
  },
  codex: {
    bin: 'codex',
    hybrid: false,
    name: 'codex',
    run(_promptFile: string, outFile: string): BackendRun {
      const model = process.env['CODEX_MODEL'] ?? 'gpt-5.4'
      const reasoning = process.env['CODEX_REASONING'] ?? 'xhigh'
      return {
        argv: [
          'exec',
          '--model',
          model,
          '-c',
          `model_reasoning_effort=${reasoning}`,
          '--full-auto',
          '--ephemeral',
          '-o',
          outFile,
          '-',
        ],
        outMode: 'file',
      }
    },
  },
  kimi: {
    bin: 'kimi',
    hybrid: false,
    name: 'kimi',
    run(_promptFile: string, _outFile: string): BackendRun {
      const model = process.env['KIMI_MODEL'] ?? 'kimi-latest'
      return {
        argv: ['chat', '--model', model, '--no-stream'],
        outMode: 'stdout',
      }
    },
  },
  opencode: {
    bin: 'opencode',
    hybrid: true,
    name: 'opencode',
    run(_promptFile: string, _outFile: string): BackendRun {
      // opencode reads the prompt from stdin and writes to stdout in its
      // non-interactive `run` form. `OPENCODE_MODEL` pins a `provider/model`
      // slug for this run — how Fireworks + Synthetic are reached (e.g.
      // `fireworks-ai/accounts/fireworks/models/glm-5p1`,
      // `synthetic/hf:moonshotai/Kimi-K2.5`); see _shared/multi-agent-backends.md
      // for the slug catalog. Absent the env, opencode picks per its own config.
      const model = process.env['OPENCODE_MODEL']
      return {
        argv: model ? ['run', '--model', model] : ['run'],
        outMode: 'stdout',
      }
    },
  },
} as unknown as Readonly<Record<BackendName, BackendDescriptor>>

/**
 * The set of backends whose CLI is installed. Fans the `which` lookups out
 * concurrently rather than awaiting one at a time.
 */
export async function detectAvailableBackends(): Promise<
  ReadonlySet<BackendName>
> {
  const names = Object.keys(BACKENDS) as BackendName[]
  const results = await Promise.all(
    names.map(async name => ({
      available: await isCommandAvailable(BACKENDS[name]!.bin),
      name,
    })),
  )
  return new Set(results.filter(r => r.available).map(r => r.name))
}

/**
 * True when `value` names a known backend.
 */
export function isBackendName(value: string): value is BackendName {
  return value in BACKENDS
}

/**
 * True when the named CLI resolves on PATH (cross-platform via `which`).
 */
export async function isCommandAvailable(bin: string): Promise<boolean> {
  return (await which(bin)) !== null
}

export type BackendResolution =
  // An explicit override was honored.
  | { readonly backend: BackendName; readonly reason: 'override' }
  // The first installed, non-hybrid backend in the preference order.
  | { readonly backend: BackendName; readonly reason: 'preference' }
  // An override was requested but not installed; fell through to preference.
  | {
      readonly backend: BackendName
      readonly reason: 'preference'
      readonly overrideMissing: BackendName
    }
  // Nothing usable — the caller should skip this pass with a note.
  | { readonly backend: undefined; readonly reason: 'unavailable' }

export interface ResolveBackendOptions {
  // Ordered, most-preferred-first. Hybrid backends in the order are skipped
  // unless named as the explicit override.
  readonly preferenceOrder: readonly BackendName[]
  readonly available: ReadonlySet<BackendName>
  // A caller-named backend that wins when installed (the only way to select a
  // hybrid backend like opencode).
  readonly override?: BackendName | undefined
}

/**
 * Resolve which backend runs a pass, encoding the fleet detection policy
 * (`_shared/multi-agent-backends.md`): an installed explicit override wins;
 * else the first installed non-hybrid entry in the preference order; else
 * nothing (skip the pass). Pure — returns the decision + why, never logs. An
 * override that isn't installed is reported via `overrideMissing` so the caller
 * can warn.
 */
export function resolveBackendForRole(
  options: ResolveBackendOptions,
): BackendResolution {
  const opts = { __proto__: null, ...options } as typeof options
  const { available, override, preferenceOrder } = opts
  if (override && available.has(override)) {
    return { backend: override, reason: 'override' }
  }
  for (let i = 0, { length } = preferenceOrder; i < length; i += 1) {
    const candidate = preferenceOrder[i]!
    // Hybrid backends (opencode) are never auto-picked — only via override.
    if (BACKENDS[candidate]?.hybrid) {
      continue
    }
    if (available.has(candidate)) {
      return override
        ? {
            backend: candidate,
            overrideMissing: override,
            reason: 'preference',
          }
        : { backend: candidate, reason: 'preference' }
    }
  }
  return { backend: undefined, reason: 'unavailable' }
}
