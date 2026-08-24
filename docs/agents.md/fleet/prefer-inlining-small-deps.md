# Prefer inlining a small dependency

Before adding a new npm dependency, check whether it is small enough and
single-purpose enough to port the needed logic in-tree instead. A
permissively-licensed, few-hundred-line utility doesn't need a
`node_modules` entry, a lockfile bump, and a transitive-dep surface if the
sliver of behavior actually needed can be copied with attribution.

## The rule

- **Check size and scope before reaching for npm.** A single-function
  utility, say a regex, a small algorithm or a format helper, with a permissive
  license (MIT/ISC/Apache-2.0/BSD) is a candidate to inline rather than
  depend on. A framework, a multi-module library, or anything copyleft
  (AGPL/GPL - see
  [`copyleft-boundaries`](copyleft-boundaries.md)) is not.
- **Port only what is used, not the whole package.** Trim dead branches
  the caller's real inputs never exercise - sdxgen's `xml-parse.mts`
  inlines `strnum`'s number-coercion algorithm but drops its
  binary/octal/unicode branches, since `fast-xml-parser`'s own defaults
  never exercise them, and those defaults are the behavior being replicated.
- **Credit the source in a comment**: package name, license, and a link,
  right above the ported code, so a future reader knows where it came
  from and can diff against upstream if it ever needs a fix.
- **This is judgment, not a hard rule.** A dependency worth its weight
  (a real parser, a crypto primitive, anything with edge cases you would
  get wrong by hand) stays a dependency. The nudge below fires on every
  new dependency and is advisory - it never blocks.

## Enforcement

- `prefer-inline-small-dependency-nudge` (PreToolUse, `package.json`)
  fires when an edit adds a dependency name that wasn't present before
  meaning a genuine addition rather than a version bump, naming the new package and
  pointing back here. Never blocks.

## Why

`fast-xml-parser`'s tag-value coercion delegates to `strnum`, a package
whose entire job is a ~170-line numeric-string edge-case matcher
(hex, leading zeros, e-notation). sdxgen's own XML fast path
(`src/utils/xml-parse.mts`) needed that exact behavior to stay
byte-identical to `fast-xml-parser`'s defaults, but reaching for `strnum`
as a fourth direct dependency for one function would have added a
`node_modules` entry and a lockfile bump for a hundred-odd lines already
sitting one `node_modules` hop away. Porting the relevant branches in
directly, with an attribution comment, kept the dependency surface flat.
