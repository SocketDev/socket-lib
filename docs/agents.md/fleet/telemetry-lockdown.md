# Telemetry / phone-home lockdown

Companion to the `### Supply-chain & network` rule in `template/CLAUDE.md`.
Policy: **we never silently phone home.** Every dependency and external tool is
held to telemetry-off, enforced fail-closed at two layers, re-checked on every
software update. The sfw CDN allowlist is the runtime backstop regardless.

## The two enforcement arms

1. **Dep-surface scanner** (`scripts/fleet/lib/telemetry-scan.mts`): name-based
   detection of known telemetry / analytics SDKs (Sentry, PostHog, Segment,
   Amplitude, Datadog, OpenTelemetry **SDK + exporters**, langfuse, Scarf,
   Bugsnag, Rollbar, …) across `pnpm-lock.yaml`, every `uv.lock`, and
   `external-tools.json` purls. Inert APIs that cannot export
   (`opentelemetry-api` with no exporter) are deliberately NOT flagged.
   - `REVIEWED_TELEMETRY` is the audited baseline. Any SDK **not** in it FAILS —
     so an SDK ADDED by a dep bump or a new tool is caught and forced through a
     human review + an explicit accept-with-reason.
   - Runs as a `check --all` gate (`check/telemetry-deps-are-reviewed.mts`) AND
     as a Pass-4 scan in `scripts/fleet/update.mts` (every `pnpm run update`
     re-checks the refreshed lockfile).
2. **Per-tool runtime lockdown**: a tool's OWN telemetry (not a third-party SDK,
   so invisible to the dep scanner) is forced off at the launch chokepoint. See
   headroom: its `bin/headroom` is a wrapper that exports
   `HEADROOM_TELEMETRY=off` + `HEADROOM_TELEMETRY_WARN=off` + `HF_HUB_OFFLINE=1`
   before exec (`setup-security-tools/lib/headroom.mts`), a load-time invariant
   throws if the lockdown is weakened (fail-closed import), and
   `check/headroom-is-telemetry-locked-down.mts` gates it. Audit:
   `.claude/reports/headroom-telemetry-audit.md`.

## Reviewing a finding (when the scan fails)

1. Read the SDK's code: default-on or opt-in? what endpoint? what payload? does
   it need a key/env to ship (most do — no key = inert)?
2. Neutralize, in order of preference: drop the dep / tool; `pnpm-workspace.yaml`
   `overrides:` to a stub; an env opt-out at the launch chokepoint; a per-tool
   lockdown wrapper (the headroom pattern).
3. Only if genuinely inert (no key configured, no default-on egress) AND covered
   by the sfw allowlist backstop: add it to `REVIEWED_TELEMETRY` with the exact
   reason it is tolerated. Re-review on every bump.

## Current reviewed baseline

- `posthog-node` / `@posthog/core` / `@posthog/types` — PostHog analytics,
  transitive via `@rely-ai/caliber`. Inert without `POSTHOG_*` env (the SDK
  no-ops with no project key); sfw blocks the posthog hosts. Re-review if
  `@rely-ai/caliber` ever ships a hardcoded key.

## sfw backstop

Everything runs under Socket Firewall. The CDN allowlist must NOT include
telemetry hosts (supabase telemetry projects, `*.headroomlabs.ai`,
`cloud.langfuse.com`, posthog hosts, `huggingface.co` for model fetches); only
the LLM-provider host a proxy legitimately forwards to. So even a regressed env
var cannot leak — the firewall denies the egress.
