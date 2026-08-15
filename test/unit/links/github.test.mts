/**
 * @file Unit tests for `githubRefLink` — turning a repository URL plus a
 *   pull-request/issue number into a Markdown link, and degrading to bare
 *   `#N` text when the URL is unparseable.
 */

import { describe, expect, it } from 'vitest'

import { githubRefLink } from '../../../src/links/github'

describe('links/github — githubRefLink', () => {
  it('builds a pull link from a .git https URL', () => {
    expect(githubRefLink('https://github.com/PerryTS/perry.git', 7384)).toBe(
      '[#7384](https://github.com/PerryTS/perry/pull/7384)',
    )
  })

  it('builds an issues link when kind is "issues"', () => {
    expect(
      githubRefLink('https://github.com/PerryTS/perry.git', 793, 'issues'),
    ).toBe('[#793](https://github.com/PerryTS/perry/issues/793)')
  })

  it('handles an https URL without the .git suffix', () => {
    expect(githubRefLink('https://github.com/nodejs/node', 12_345)).toBe(
      '[#12345](https://github.com/nodejs/node/pull/12345)',
    )
  })

  it('builds a stack link to the stacks REST URL when kind is "stack"', () => {
    // Stacks have no HTML page — the api.github.com URL is the canonical
    // resolvable surface, and the label carries the `stack` prefix so the
    // target isn't mistaken for a PR.
    expect(
      githubRefLink('https://github.com/PerryTS/perry', 178, 'stack'),
    ).toBe(
      '[stack #178](https://api.github.com/repos/PerryTS/perry/stacks/178)',
    )
  })

  it('degrades to bare #N when the URL is unparseable', () => {
    expect(githubRefLink('not-a-repo-url', 42)).toBe('#42')
    // scp-style git@ URLs are not parsed by getRepoUrlDetails, so they also
    // degrade rather than emit a malformed link.
    expect(githubRefLink('git@github.com:npm/cli.git', 42)).toBe('#42')
  })
})
