/**
 * @file Agent-awareness for hooks + scripts: WHICH agent is running right now,
 *   and WHERE that agent keeps its config / memory on the current platform. Two
 *   distinct questions, two functions:
 *
 *   - `detectAgent()` — who is invoking this process? Read from the environment
 *     the running agent injects, NOT from any stdin payload (a Claude Code hook
 *     gets `{tool_name,…}` on stdin but no agent id; Codex/OpenCode use
 *     entirely different invocation contracts). The cross-agent signal is
 *     `AI_AGENT` (Claude Code sets `AI_AGENT=claude-code_<ver>_agent`);
 *     tool-specific flags (`CLAUDECODE`, `CODEX_*`, `OPENCODE`) are the
 *     fallback. Returns `undefined` when nothing identifies an agent (a plain
 *     shell / CI).
 *   - `agentPaths()` — given an agent, the config + memory directories it uses on
 *     THIS OS. Built on the cross-platform `getHome()` (HOME → USERPROFILE) and
 *     XDG helpers so a Windows path differs from mac/linux correctly. This is
 *     the runtime complement to `discoverAiAgents()` (which agents are
 *     INSTALLED on PATH); this answers which one is DRIVING + where it lives.
 *     Memory caveat baked into the data: only Claude Code maintains an
 *     agent-written memory store (`~/.claude/projects/<slug>/memory/`). Codex +
 *     OpenCode have NO self-written memory — their only persistent context is
 *     the human-authored AGENTS.md. So `agentPaths(...).memoryDir` is defined
 *     only for `claude`; for the others it is `undefined` (there is no memory
 *     dir to point at), and the shared cross-tool memory surface is the
 *     committed AGENTS.md (which the fleet symlinks to CLAUDE.md).
 */

import { WIN32 } from '../constants/platform'
import { getHome } from '../env/home'
import { getEnvValue } from '../env/rewire'
import { getXdgConfigHome } from '../env/xdg'

import path from 'node:path'

import type { AiAgentName } from './types.mts'

/**
 * The detected running agent + the raw version token from `AI_AGENT`, when
 * present. `agent` is the normalized `AiAgentName`; `raw` is the full env value
 * (e.g. `claude-code_2-1-169_agent`) for callers that want the version.
 */
export interface DetectedAgent {
  readonly agent: AiAgentName
  readonly raw: string | undefined
}

// Map an `AI_AGENT` value's leading token to an AiAgentName. Claude Code uses
// `claude-code_<ver>_agent`; we match the family prefix so a version bump
// doesn't break detection.
export function agentFromAiAgentEnv(value: string): AiAgentName | undefined {
  const lower = value.toLowerCase()
  if (lower.startsWith('claude')) {
    return 'claude'
  }
  if (lower.startsWith('codex')) {
    return 'codex'
  }
  if (lower.startsWith('opencode')) {
    return 'opencode'
  }
  if (lower.startsWith('gemini')) {
    return 'gemini'
  }
  return undefined
}

/**
 * The config + memory directories an agent uses on the current platform.
 *
 * `configDir` is where the agent keeps global config / instructions.
 * `memoryDir` is the agent-written persistent-memory store — defined ONLY for
 * `claude` (Codex/OpenCode have no self-written memory; their durable context
 * is the human-authored AGENTS.md). For non-claude agents `memoryDir` is
 * `undefined`.
 *
 * All paths derive from `getHome()` (HOME → USERPROFILE, cross-platform) so the
 * Windows location differs from mac/linux correctly. Returns `undefined` when
 * the home dir can't be resolved.
 */
export interface AgentPaths {
  readonly agent: AiAgentName
  readonly configDir: string
  // Agent-written memory store; only `claude` has one.
  readonly memoryDir: string | undefined
}

/**
 * Resolve an agent's config (and, for Claude, memory) directories on this OS.
 *
 * Per-agent / per-platform (verified against each tool's docs; flagged where a
 * platform path is best-effort):
 *
 * - **claude**: `~/.claude` on every OS. Memory:
 *   `~/.claude/projects/<cwd-slug>/memory/` (slug = cwd with `/`→`-`). Pass
 *   `options.cwd` to compute the memory dir for a specific project.
 * - **codex**: `$CODEX_HOME` if set, else `~/.codex` (all OSes, incl. Windows
 *   `%USERPROFILE%\.codex` — Codex uses a dotdir, not %APPDATA%). No memory.
 * - **opencode**: XDG — `$XDG_CONFIG_HOME/opencode` else `~/.config/opencode` on
 *   mac/linux; on Windows `%APPDATA%\opencode` (best-effort: OpenCode's docs
 *   don't pin the Windows user-config path; APPDATA is the conventional
 *   fallback and is overridable via `$XDG_CONFIG_HOME`). No memory.
 * - **gemini**: `~/.gemini` (all OSes). No memory.
 *
 * @returns The resolved paths, or `undefined` if the home dir is unresolvable.
 */
export function agentPaths(
  agent: AiAgentName,
  options?: { cwd?: string | undefined } | undefined,
): AgentPaths | undefined {
  const opts = { __proto__: null, ...options } as { cwd?: string | undefined }
  const home = getHome()
  if (!home) {
    return undefined
  }
  switch (agent) {
    case 'claude': {
      const configDir = path.join(home, '.claude')
      // Claude keys memory by cwd slug: an absolute cwd with every `/`
      // replaced by `-` (a leading `/` becomes a leading `-`).
      const cwd = opts.cwd
      const memoryDir = cwd
        ? path.join(configDir, 'projects', cwd.replace(/[/\\]/g, '-'), 'memory')
        : undefined
      return { agent, configDir, memoryDir }
    }
    case 'codex': {
      const codexHome = getEnvValue('CODEX_HOME')
      return {
        agent,
        configDir: codexHome || path.join(home, '.codex'),
        memoryDir: undefined,
      }
    }
    case 'opencode': {
      // XDG on POSIX; %APPDATA% on Windows (best-effort — see docstring).
      const xdg = getXdgConfigHome()
      let base: string
      if (xdg) {
        base = xdg
      } else if (WIN32) {
        base = getEnvValue('APPDATA') || path.join(home, '.config')
      } else {
        base = path.join(home, '.config')
      }
      return {
        agent,
        configDir: path.join(base, 'opencode'),
        memoryDir: undefined,
      }
    }
    case 'gemini': {
      return {
        agent,
        configDir: path.join(home, '.gemini'),
        memoryDir: undefined,
      }
    }
  }
}

/**
 * Detect which AI agent is invoking the current process, from the environment.
 *
 * Resolution order:
 *
 * 1. `AI_AGENT` — the cross-agent signal (Claude Code sets it). Its leading token
 *    names the family.
 * 2. Tool-specific flags as a fallback: `CLAUDECODE=1` / `CLAUDE_CODE_*` → claude;
 *    `CODEX_*` → codex; `OPENCODE` → opencode.
 *
 * Returns `undefined` when no agent signal is present (a plain shell, CI, a
 * non-agent subprocess) — callers should treat that as "agent-agnostic", not an
 * error.
 *
 * Note: a hook receives NO agent id in its stdin payload; this env read is the
 * only reliable signal. Different agents also invoke hooks differently (Claude:
 * stdin JSON; Codex: its own hooks; OpenCode: plugin callbacks), so a
 * `.claude/hooks/` script is fundamentally Claude-invoked — `detectAgent()` is
 * most useful for scripts/skills that want to branch on the active agent, or
 * when an agent delegates to another.
 *
 * @example
 *   const detected = detectAgent()
 *   if (detected?.agent === 'claude') { ... }
 */
export function detectAgent(): DetectedAgent | undefined {
  const aiAgent = getEnvValue('AI_AGENT')
  if (aiAgent) {
    const agent = agentFromAiAgentEnv(aiAgent)
    if (agent) {
      return { agent, raw: aiAgent }
    }
  }
  // Fallbacks: tool-specific env markers.
  if (getEnvValue('CLAUDECODE') || getEnvValue('CLAUDE_CODE_ENTRYPOINT')) {
    return { agent: 'claude', raw: aiAgent }
  }
  if (getEnvValue('OPENCODE')) {
    return { agent: 'opencode', raw: aiAgent }
  }
  // Codex sets CODEX_HOME / CODEX_* in a real run. The codex-plugin companion
  // var (CODEX_COMPANION_SESSION_ID) is set even under Claude, so it is NOT a
  // codex-is-running signal and is excluded here.
  if (getEnvValue('CODEX_SANDBOX') || getEnvValue('CODEX_HOME')) {
    return { agent: 'codex', raw: aiAgent }
  }
  return undefined
}
