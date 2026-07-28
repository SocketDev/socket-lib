/**
 * @file OpenAI-compatible HTTP backends for AI providers that expose a
 *   chat-completions endpoint rather than a CLI — Fireworks
 *   (`api.fireworks.ai`) and Synthetic (`api.synthetic.new`). The CLI path
 *   (`spawn.mts`) drives an interactive agent binary; this path is for a
 *   script/hook that needs a single completion from a model without an agent
 *   harness (the way the local OpenCode setup reaches GLM-5.2 / Kimi-K2.6). Why
 *   a separate module from `spawn.mts`: those are different surfaces. A CLI
 *   agent gets tools + a permission mode + a working dir; an HTTP completion
 *   gets a prompt + a model + (optionally) a reasoning effort and returns text.
 *   Conflating them would force every HTTP call to carry meaningless CLI
 *   lockdown fields. Lockdown equivalent: these calls send NO tools /
 *   function-calling surface — they're plain completions, so there's no agentic
 *   capability to constrain. The token is read from the env var the provider
 *   config names (`FIREWORKS_API_KEY` / `SYNTHETIC_API_KEY`), NEVER passed
 *   inline, and never logged — same token-hygiene rule as the rest of Socket. A
 *   missing token throws with the exact env var to set. Wire format is the
 *   OpenAI Chat Completions API (`POST {baseUrl}/chat/completions`), which both
 *   providers implement.
 */

// oxlint-disable-next-line socket/no-platform-specific-import -- the relative barrel '../http-request' has no index.ts and exports-map resolution only applies to the bare package name, so only the explicit /node path resolves here (the rule's autofix produces an unresolvable import — verified TS2307). Matches src/dlx/firewall.ts.
import { httpJson } from '../http-request/node'
import { ErrorCtor } from '../primordials/error'
import {
  isCredentialProvider,
  resolveProviderCredential,
} from './credentials.mts'

import type { AiEffort } from './types.mts'

/**
 * An OpenAI-compatible HTTP provider. `id` is the slug prefix used in
 * `provider/model` references; `baseUrl` is the chat-completions API root;
 * `tokenEnv` names the env var holding the bearer token.
 */
export interface AiHttpProvider {
  readonly id: string
  readonly baseUrl: string
  readonly tokenEnv: string
}

/**
 * Built-in OpenAI-compatible providers. Add an entry to support a new one — no
 * other call site changes. Base URLs are the documented chat-completions
 * roots.
 */
export const AI_HTTP_PROVIDERS: Readonly<Record<string, AiHttpProvider>> = {
  __proto__: null,
  fireworks: {
    id: 'fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    tokenEnv: 'FIREWORKS_API_KEY',
  },
  synthetic: {
    id: 'synthetic',
    baseUrl: 'https://api.synthetic.new/openai/v1',
    tokenEnv: 'SYNTHETIC_API_KEY',
  },
} as unknown as Readonly<Record<string, AiHttpProvider>>

/**
 * Inputs to a single completion call.
 *
 * Required: `provider`, `model`, `prompt`. `effort` maps to the OpenAI
 * `reasoning_effort` field for models that support it (left off otherwise).
 */
export interface AiHttpCallOptions {
  /**
   * Provider id (a key of AI_HTTP_PROVIDERS) or a full AiHttpProvider.
   */
  readonly provider: string | AiHttpProvider
  /**
   * The provider's model id (e.g. `accounts/fireworks/models/glm-5p2`,
   * `hf:moonshotai/Kimi-K2.6`).
   */
  readonly model: string
  /**
   * The user prompt.
   */
  readonly prompt: string
  /**
   * Optional system prompt prepended as the `system` role message.
   */
  readonly system?: string | undefined
  /**
   * Reasoning effort (`reasoning_effort` field); omitted when absent. Only set
   * for a model that supports it — providers ignore or reject it otherwise.
   */
  readonly effort?: AiEffort | undefined
  /**
   * Sampling temperature; provider default when absent.
   */
  readonly temperature?: number | undefined
  /**
   * Per-call timeout (ms).
   */
  readonly timeoutMs?: number | undefined
  /**
   * An explicit bearer token that wins over env + keychain. When absent the
   * token resolves via `resolveProviderCredential` (env → keychain).
   */
  readonly token?: string | undefined
  /**
   * Skip the keychain fallback when resolving the token — env var only. Set in
   * headless contexts (CI, hooks) where a keychain auth prompt is
   * unacceptable.
   */
  readonly allowEnvOnly?: boolean | undefined
}

/**
 * Result of a completion: the assistant text plus the raw provider response for
 * callers that need usage / finish-reason detail.
 */
export interface AiHttpResult {
  readonly text: string
  readonly raw: OpenAiChatResponse
}

/**
 * The slice of the OpenAI chat-completions response we read.
 */
export interface OpenAiChatResponse {
  readonly choices?:
    | ReadonlyArray<{ message?: { content?: string | undefined } | undefined }>
    | undefined
}

/**
 * Build the chat-completions request body. Kept pure for testing — the effort →
 * `reasoning_effort` mapping + system-message prepend are the parts worth
 * asserting without a network call.
 */
export function buildChatRequestBody(options: AiHttpCallOptions): string {
  options = { __proto__: null, ...options } as typeof options
  const messages: Array<{ role: string; content: string }> = []
  if (options.system) {
    messages.push({ content: options.system, role: 'system' })
  }
  messages.push({ content: options.prompt, role: 'user' })
  const body: Record<string, unknown> = {
    messages,
    model: options.model,
  }
  if (options.effort) {
    body['reasoning_effort'] = options.effort
  }
  if (typeof options.temperature === 'number') {
    body['temperature'] = options.temperature
  }
  return JSON.stringify(body)
}

/**
 * Call an OpenAI-compatible chat-completions endpoint and return the assistant
 * text. The bearer token is read from the provider's `tokenEnv` env var — never
 * accepted as a parameter, never logged. Throws when the token env var is unset
 * (naming the var to set) or when the response carries no message text.
 *
 * @example
 *   ;```ts
 *   const { text } = await callAiHttpModel({
 *     provider: 'fireworks',
 *     model: 'accounts/fireworks/models/glm-5p2',
 *     prompt: 'Summarize this diff: …',
 *     effort: 'high',
 *   })
 *   ```
 */
export async function callAiHttpModel(
  options: AiHttpCallOptions,
): Promise<AiHttpResult> {
  options = { __proto__: null, ...options } as typeof options
  const provider = resolveAiHttpProvider(options.provider)
  // Resolve via the layered resolver (explicit → env → keychain) when the
  // provider is a known CredentialProvider; otherwise fall back to its env var
  // directly (a caller-supplied custom provider not in the credential map).
  const token = isCredentialProvider(provider.id)
    ? await resolveProviderCredential({
        allowEnvOnly: options.allowEnvOnly,
        explicit: options.token,
        provider: provider.id,
      })
    : (options.token ?? process.env[provider.tokenEnv])
  if (!token) {
    throw new ErrorCtor(
      `Missing API token for AI HTTP provider "${provider.id}". Set the ${provider.tokenEnv} environment variable (a bearer token) or store it in the keychain — never pass it inline.`,
    )
  }
  const url = `${provider.baseUrl}/chat/completions`
  const raw = await httpJson<OpenAiChatResponse>(url, {
    body: buildChatRequestBody(options),
    headers: {
      // The token is interpolated into the Authorization header only; it is
      // never logged or echoed back to the caller.
      Authorization: `Bearer ${token}`,
    },
    method: 'POST',
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
  })
  const text = raw.choices?.[0]?.message?.content
  if (typeof text !== 'string') {
    throw new ErrorCtor(
      `AI HTTP provider "${provider.id}" returned no message text for model "${options.model}". The response had no choices[0].message.content — check the model id and the provider's status.`,
    )
  }
  return { raw, text }
}

/**
 * Resolve a provider id / object to an AiHttpProvider. Throws with the known
 * provider set when an unknown id is passed.
 */
export function resolveAiHttpProvider(
  provider: string | AiHttpProvider,
): AiHttpProvider {
  if (typeof provider !== 'string') {
    return provider
  }
  const found = AI_HTTP_PROVIDERS[provider]
  if (!found) {
    const known = Object.keys(AI_HTTP_PROVIDERS).join(', ')
    throw new ErrorCtor(
      `Unknown AI HTTP provider "${provider}". Known providers: ${known}. Pass a known id or a full AiHttpProvider { id, baseUrl, tokenEnv }.`,
    )
  }
  return found
}
