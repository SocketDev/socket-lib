/**
 * @file `prim` self-description surfaces: the human help text and the
 *   machine-readable `--describe` manifest, kept beside each other so the two
 *   views of the interface cannot drift apart unnoticed.
 */

import { buildCliManifest } from '../../../src/exe/argv/meta.mjs'
import primPackageJson from '../package.json' with { type: 'json' }

const PRIM_VERSION = primPackageJson.version

export const HELP = `prim — audit & migrate JavaScript built-in usage to primordials

USAGE
  prim <command> [options]

COMMANDS
  audit                Find call sites where primordials apply.
                       Default: shows migration candidates AND surface
                       gaps. Filter with --coverage or --gaps.
  mod                  Rewrite call sites to use primordials. Dry-run
                       by default; pass --apply to write. .js only.
  lint                 Structural lint rules for primordials usage.
                       Currently: ctor-rename (constructor primordials
                       must be aliased \`<Name>: <Name>Ctor\`).
                       Exits 1 if violations are found.

COMMON OPTIONS
  --target <path>      Repo to audit (default: cwd).
  --dir <name>         Subdirectory to scan. Default \`dist\` for audit;
                       default \`src\` for mod and lint.
  --json               JSON output instead of human-readable text.
  --describe           What this tool does, one line. With --json, a
                       machine-readable command manifest.
  --help, -h           Show this help.

\`audit\` OPTIONS
  --coverage           Show only migration candidates.
  --gaps               Show only surface gaps.
                       (No flag = both.)
  --surface <path>     Explicit primordials source file (overrides the
                       default sibling/installed lookup). Use this to
                       audit against Node's
                       lib/internal/per_context/primordials.js or any
                       other primordials-shaped source.

\`mod\` OPTIONS
  --apply              Actually write file changes. Without this, runs
                       as a dry-run and prints the diff summary only.
  --include-guessed    Also rewrite prototype-method calls where the
                       receiver type was guessed from the identifier
                       name. Off by default — these need manual review.
  --no-validate        Skip the cross-batch validation pass (self-imports,
                       writes inside the primordials root, unparseable
                       output). ON by default — opt out only when you know
                       the rewrite is safe and the validator is being too
                       conservative. Bypassing has caused real install
                       breaks; the default is the safer choice.
  --diff               In dry-run mode, render a unified line-diff per
                       file after the summary so you can review the
                       exact rewrites before passing --apply. No-op
                       when --apply is set or no rewrites are planned.
  --surface <path>     Explicit primordials source file (same as audit).

\`audit\` AND \`mod\` SHARED OPTION
  --ai-disambiguate    Defer ambiguous prototype methods (.test, .then,
                       .exec, .catch, .finally) to Claude Sonnet for
                       receiver-type classification when the static
                       guess can't decide. Reads the surrounding source
                       only — no Bash, no Edit, no Write. Verdicts are
                       cached in <target>/.prim-cache/ so re-runs are
                       free. Off by default — opt-in. Requires
                       ANTHROPIC_API_KEY in env.

\`lint\` OPTIONS
  --primordials-source <name>  (repeatable) Identifier or require()
                       specifier to treat as a primordials-shaped source.
                       Defaults: \`primordials\`,
                       \`internal/socketsecurity/primordials\`,
                       \`internal/socketsecurity/safe-references\`,
                       \`safe-references\`.

EXAMPLES
  # See migration candidates + surface gaps in src/:
  prim audit --target . --dir src

  # Only the gaps (what's missing from socket-lib's primordials):
  prim audit --target ../sibling-repo --gaps

  # Only the migration candidates (what we could rewrite today):
  prim audit --target . --dir dist --coverage

  # Dry-run a codemod over the source tree:
  prim mod --target . --dir src

  # Apply for real (only after reviewing the dry-run):
  prim mod --target . --dir src --apply

  # Lint additions for ctor-rename violations:
  prim lint --target additions/source-patched --dir lib
`

export const MANIFEST = buildCliManifest({
  name: 'prim',
  version: PRIM_VERSION,
  description:
    'Audit and migrate JavaScript built-in usage to primordials, and lint primordials style',
  commands: [
    {
      name: 'audit',
      description:
        'Find call sites where primordials apply: migration candidates and surface gaps',
      flags: [
        {
          name: 'coverage',
          type: 'boolean',
          default: false,
          description: 'Show only migration candidates',
        },
        {
          name: 'gaps',
          type: 'boolean',
          default: false,
          description: 'Show only surface gaps',
        },
        {
          name: 'surface',
          type: 'string',
          description: 'Explicit primordials source file',
        },
      ],
    },
    {
      name: 'mod',
      description:
        'Rewrite call sites to use primordials; dry-run unless --apply',
      flags: [
        {
          name: 'apply',
          type: 'boolean',
          default: false,
          description: 'Write file changes instead of dry-running',
        },
        {
          name: 'diff',
          type: 'boolean',
          default: false,
          description: 'Render a unified diff per planned rewrite',
        },
        {
          name: 'include-guessed',
          type: 'boolean',
          default: false,
          description: 'Also rewrite receiver-type-guessed prototype calls',
        },
        {
          name: 'surface',
          type: 'string',
          description: 'Explicit primordials source file',
        },
      ],
    },
    {
      name: 'lint',
      description: 'Structural lint rules for primordials usage',
      flags: [
        {
          name: 'primordials-source',
          type: 'string',
          description:
            'Identifier or require() specifier treated as a primordials-shaped source; repeatable',
        },
      ],
    },
  ],
  flags: [
    {
      name: 'target',
      type: 'string',
      description: 'Repo to audit; defaults to cwd',
    },
    {
      name: 'dir',
      type: 'string',
      description:
        'Subdirectory to scan; audit defaults to dist, mod and lint to src',
    },
    {
      name: 'json',
      type: 'boolean',
      default: false,
      description: 'Output as JSON',
    },
    {
      name: 'describe',
      type: 'boolean',
      default: false,
      description:
        'Print what this tool does and exit; with --json, a machine-readable command manifest',
    },
    {
      name: 'help',
      type: 'boolean',
      short: 'h',
      default: false,
      description: 'Show help',
    },
  ],
})

/**
 * The `{describe, help}` JSON envelope for a `--json` request with no
 * command-specific result to report: `prim --describe --json` (either
 * order), or bare `prim --json` with no command. Deliberately minimal — the
 * full command/flag manifest is what plain `--describe --json` used to dump;
 * this is the fleet-runner-shaped self-description instead, so a caller
 * scripting against `prim --json` gets the same two fields every fleet
 * script answers with.
 */
export function renderDescribeHelpJson(): string {
  return `${JSON.stringify(
    { describe: MANIFEST.description, help: HELP },
    undefined,
    2,
  )}\n`
}
