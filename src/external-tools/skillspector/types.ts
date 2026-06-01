/**
 * @file Shared types for SkillSpector resolution. SkillSpector is NVIDIA's
 *   third-party-skill scanner (sibling to AgentShield); pinned to a git SHA
 *   because upstream has no PyPI release or GH tags as of 2026-06-01.
 */

export type SkillSpectorSource = 'vfs' | 'pipx' | 'path' | 'dlx'

/**
 * A resolved SkillSpector installation.
 */
export interface ResolvedSkillSpector {
  /**
   * Absolute path to the `skillspector` entry-point executable.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   *
   * - 'vfs' — extracted from the SEA binary's VFS
   * - 'pipx' — `which skillspector` returned a pipx-installed venv binary
   * - 'path' — `which skillspector` returned a non-pipx binary on PATH
   * - 'dlx' — created a venv under ~/.socket/_dlx/skillspector/<sha>/
   */
  readonly source: SkillSpectorSource
}
