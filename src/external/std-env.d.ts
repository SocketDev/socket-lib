/**
 * Hand-authored type surface for the bundled `std-env` external. std-env is a
 * devDependency inlined into `dist/external/std-env.js` at build time; these
 * declarations ship in its place so the public `env/*` re-exports resolve
 * without consumers installing std-env. Mirrors std-env's own `index.d.mts`.
 */

/**
 * Represents the name of an AI coding agent.
 */
export type AgentName =
  | (string & {})
  | 'cursor'
  | 'claude'
  | 'devin'
  | 'replit'
  | 'gemini'
  | 'codex'
  | 'auggie'
  | 'opencode'
  | 'kiro'
  | 'goose'
  | 'pi'

/**
 * Provides information about an AI coding agent.
 */
export type AgentInfo = {
  /**
   * The name of the AI coding agent. See {@link AgentName} for possible values.
   */
  name?: AgentName
}

/**
 * Detects the current AI coding agent from environment variables.
 */
export declare function detectAgent(): AgentInfo

/**
 * The detected agent information, evaluated once at module initialisation.
 */
export declare const agentInfo: AgentInfo

/**
 * Name of the detected agent.
 */
export declare const agent: AgentName | undefined

/**
 * Whether the current environment is running inside an AI coding agent.
 */
export declare const isAgent: boolean

/**
 * Value of process.platform.
 */
export declare const platform: string

/**
 * Detect if `CI` environment variable is set or a provider CI detected.
 */
export declare const isCI: boolean

/**
 * Detect if stdout.TTY is available.
 */
export declare const hasTTY: boolean

/**
 * Detect if global `window` object is available.
 */
export declare const hasWindow: boolean

/**
 * Detect if `DEBUG` environment variable is set.
 */
export declare const isDebug: boolean

/**
 * Detect if `NODE_ENV` environment variable is `test` or `TEST` is set.
 */
export declare const isTest: boolean

/**
 * Detect if `NODE_ENV` or `MODE` environment variable is `production`.
 */
export declare const isProduction: boolean

/**
 * Detect if `NODE_ENV`/`MODE` environment variable is `dev`/`development`.
 */
export declare const isDevelopment: boolean

/**
 * Detect if MINIMAL is set, running in CI or test, or TTY is unavailable.
 */
export declare const isMinimal: boolean

/**
 * Detect if process.platform is Windows.
 */
export declare const isWindows: boolean

/**
 * Detect if process.platform is Linux.
 */
export declare const isLinux: boolean

/**
 * Detect if process.platform is macOS (darwin kernel).
 */
export declare const isMacOS: boolean

/**
 * Detect if terminal color output is supported (NO_COLOR/FORCE_COLOR/TTY/CI).
 */
export declare const isColorSupported: boolean

/**
 * Node.js version string (e.g. `"20.11.0"`), or `null` outside Node.js.
 */
export declare const nodeVersion: string | null

/**
 * Node.js major version number (e.g. `20`), or `null` outside Node.js.
 */
export declare const nodeMajorVersion: number | null

/**
 * Represents the name of a CI/CD or Deployment provider.
 */
export type ProviderName =
  | (string & {})
  | 'appveyor'
  | 'aws_amplify'
  | 'azure_pipelines'
  | 'azure_static'
  | 'appcircle'
  | 'bamboo'
  | 'bitbucket'
  | 'bitrise'
  | 'buddy'
  | 'buildkite'
  | 'circle'
  | 'cirrus'
  | 'cloudflare_pages'
  | 'cloudflare_workers'
  | 'google_cloudrun'
  | 'google_cloudrun_job'
  | 'codebuild'
  | 'codefresh'
  | 'drone'
  | 'dsari'
  | 'github_actions'
  | 'gitlab'
  | 'gocd'
  | 'layerci'
  | 'hudson'
  | 'jenkins'
  | 'magnum'
  | 'netlify'
  | 'nevercode'
  | 'render'
  | 'sail'
  | 'semaphore'
  | 'screwdriver'
  | 'shippable'
  | 'solano'
  | 'strider'
  | 'teamcity'
  | 'travis'
  | 'vercel'
  | 'appcenter'
  | 'codesandbox'
  | 'stackblitz'
  | 'stormkit'
  | 'cleavr'
  | 'zeabur'
  | 'codesphere'
  | 'railway'
  | 'deno-deploy'
  | 'firebase_app_hosting'
  | 'edgeone_pages'

/**
 * Information about a CI/CD or Deployment provider.
 */
export type ProviderInfo = {
  /**
   * The name of the provider. See {@link ProviderName} for possible values.
   */
  name: ProviderName
  /**
   * When `true`, the environment is recognised as a CI/CD provider.
   */
  ci?: boolean
  /**
   * Arbitrary metadata associated with the provider.
   */
  [meta: string]: any
}

/**
 * Detects the current CI/CD or Deployment provider from environment variables.
 */
export declare function detectProvider(): ProviderInfo

/**
 * The detected provider information, evaluated once at module initialisation.
 */
export declare const providerInfo: ProviderInfo

/**
 * Name of the detected provider, empty string if none detected.
 */
export declare const provider: ProviderName

/**
 * Represents the name of a JavaScript runtime.
 *
 * @see https://runtime-keys.proposal.wintercg.org/
 */
export type RuntimeName =
  | (string & {})
  | 'workerd'
  | 'deno'
  | 'netlify'
  | 'node'
  | 'bun'
  | 'edge-light'
  | 'fastly'

export type RuntimeInfo = {
  /**
   * The name of the detected runtime.
   */
  name: RuntimeName
}

/**
 * Indicates if running in Node.js or a Node.js compatible runtime.
 */
export declare const isNode: boolean

/**
 * Indicates if running in Bun runtime.
 */
export declare const isBun: boolean

/**
 * Indicates if running in Deno runtime.
 */
export declare const isDeno: boolean

/**
 * Indicates if running in Fastly runtime.
 */
export declare const isFastly: boolean

/**
 * Indicates if running in Netlify runtime.
 */
export declare const isNetlify: boolean

/**
 * Indicates if running in EdgeLight (Vercel Edge) runtime.
 */
export declare const isEdgeLight: boolean

/**
 * Indicates if running in Cloudflare Workers runtime.
 */
export declare const isWorkerd: boolean

/**
 * Information about the detected runtime, if any.
 */
export declare const runtimeInfo: RuntimeInfo | undefined

/**
 * Name of the detected runtime, empty string if none detected.
 */
export declare const runtime: RuntimeName
