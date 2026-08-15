/**
 * @file Markdown GitHub reference links. Turns a repository URL plus a pull
 *   request or issue number into a clickable Markdown link. This is distinct
 *   from `./create`'s `link()`, which produces ANSI-colored terminal text and
 *   is not Markdown.
 */

import { getRepoUrlDetails } from '../packages/specs.mjs'

/**
 * Build a Markdown link to a GitHub pull request or issue from a repository
 * URL and a reference number.
 *
 * When `repoUrl` can't be parsed into an owner/repo pair (so a link would be
 * malformed, e.g. `https://github.com///pull/7384`), this degrades gracefully
 * to the bare `#N` text — still valid Markdown, just not a hyperlink.
 *
 * @example
 *   ;```ts
 *   import { githubRefLink } from '@socketsecurity/lib/links/github'
 *
 *   githubRefLink('https://github.com/PerryTS/perry.git', 7384)
 *   // '[#7384](https://github.com/PerryTS/perry/pull/7384)'
 *
 *   githubRefLink('https://github.com/PerryTS/perry', 793, 'issues')
 *   // '[#793](https://github.com/PerryTS/perry/issues/793)'
 *
 *   githubRefLink('not-a-repo-url', 42)
 *   // '#42'
 *   ```
 *
 * @param repoUrl - Repository URL (git/https form, e.g. from package.json
 *   `repository.url`).
 * @param n - Pull request or issue number.
 * @param kind - `'pull'` for a PR link (default) or `'issues'` for an issue
 *   link.
 *
 * @returns A Markdown link `[#N](…)`, or the bare `#N` when `repoUrl` is
 *   unparseable.
 */
export function githubRefLink(
  repoUrl: string,
  n: number,
  kind: 'pull' | 'issues' = 'pull',
): string {
  const { project, user } = getRepoUrlDetails(repoUrl)
  // Refuse to emit a malformed `https://github.com///pull/N` when the URL
  // couldn't be parsed into an owner/repo pair — degrade to bare `#N`.
  if (!user || !project) {
    return `#${n}`
  }
  return `[#${n}](https://github.com/${user}/${project}/${kind}/${n})`
}
