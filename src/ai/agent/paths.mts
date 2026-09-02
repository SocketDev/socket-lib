/**
 * @file Where an agent keeps its config and memory on the current platform.
 *   All paths derive from the cross-platform `getHome()` (HOME → USERPROFILE)
 *   and the XDG helpers, so a Windows location differs from mac/linux
 *   correctly.
 *   The memory caveat is baked into the data: only Claude Code maintains an
 *   agent-written memory store (`~/.claude/projects/<slug>/memory/`). Codex,
 *   OpenCode and Gemini have NO self-written memory — their only persistent
 *   context is the human-authored AGENTS.md, which Socket symlinks to
 *   CLAUDE.md. So `memoryDir` is defined only for `claude`.
 *   Which agent is DRIVING is `ai/agent/detect`.
 */

import { getEnvValue } from '../../env/rewire.mjs'
import { getHome } from '../../env/home.mjs'
import { getXdgConfigHome } from '../../env/xdg.mjs'
import { getNodePath } from '../../node/path.mjs'
import { isWin32 } from '../../constants/platform.mjs'
import { normalizePath } from '../../paths/normalize.mjs'

import type { AiAgentName } from '../types.mjs'

/**
 * The config + memory directories an agent uses on the current platform.
 *
 * `configDir` is where the agent keeps global config / instructions.
 * `memoryDir` is the agent-written persistent-memory store — defined ONLY for
 * `claude`. For every other agent it is `undefined`.
 */
export interface AgentPaths {
  readonly agent: AiAgentName
  readonly configDir: string
  // Agent-written memory store; only `claude` has one.
  readonly memoryDir: string | undefined
}

/**
 * Resolve an agent's config directories on this OS, plus the memory directory
 * for Claude.
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
 * - **gemini**: `~/.gemini` on every OS. No memory.
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
  const path = getNodePath()
  switch (agent) {
    case 'claude': {
      const configDir = path.join(home, '.claude')
      // Claude keys memory by cwd slug: an absolute cwd with every `/`
      // replaced by `-` (a leading `/` becomes a leading `-`).
      const cwd = opts.cwd
      const memoryDir = cwd
        ? path.join(
            configDir,
            'projects',
            normalizePath(cwd).replace(/\//g, '-'),
            'memory',
          )
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
      } else if (isWin32()) {
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
