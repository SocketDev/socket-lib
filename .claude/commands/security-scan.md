Runs the `/security-scan` skill. Chains AgentShield (Claude config audit) → zizmor (GitHub Actions security) → security-reviewer agent (grading).

For a quick manual run without the full pipeline: `pnpm run security`
