/**
 * Enterprise Model CLI Catalog.
 * Defines supported CLI commands, package names, version constraints,
 * and custom installation locations across container and Kubernetes environments.
 *
 * Conforms to:
 * - STD-COD-002: Centralized Constants
 * - STD-COD-003: Model / CLI Lifecycle Governance
 */

export interface ModelCliMetadata {
  readonly family: string;
  readonly binaryName: string;
  readonly npmPackage?: string;
  readonly installType: "npm" | "binary" | "system";
  readonly description: string;
  readonly downloadUrl?: string;
  readonly defaultArgs: readonly string[];
}

export const MODEL_CLI_CATALOG: Readonly<Record<string, ModelCliMetadata>> = Object.freeze({
  gemini: Object.freeze({
    family: "gemini",
    binaryName: "gemini",
    npmPackage: "@google/gemini-cli",
    installType: "npm",
    description: "Official Google Gemini CLI for multimodal reasoning and code generation",
    defaultArgs: Object.freeze(["--output=json"]),
  }),
  claude: Object.freeze({
    family: "claude",
    binaryName: "claude",
    npmPackage: "@anthropic-ai/claude-code",
    installType: "npm",
    description: "Anthropic Claude Code CLI for agentic coding and analysis",
    defaultArgs: Object.freeze(["--print"]),
  }),
  chatgpt: Object.freeze({
    family: "chatgpt",
    binaryName: "chatgpt",
    npmPackage: "chatgpt",
    installType: "npm",
    description: "OpenAI ChatGPT CLI for GPT-4o intelligence",
    defaultArgs: Object.freeze([]),
  }),
  copilot: Object.freeze({
    family: "copilot",
    binaryName: "github-copilot-cli",
    npmPackage: "@github/copilot",
    installType: "npm",
    description: "GitHub Copilot Developer CLI",
    defaultArgs: Object.freeze([]),
  }),
  grok: Object.freeze({
    family: "grok",
    binaryName: "grok",
    npmPackage: "grok-cli",
    installType: "npm",
    description: "xAI Grok CLI interface",
    defaultArgs: Object.freeze([]),
  }),
  ollama: Object.freeze({
    family: "ollama",
    binaryName: "ollama",
    installType: "binary",
    description: "Ollama Local On-Device AI CLI",
    downloadUrl: "https://ollama.com/download",
    defaultArgs: Object.freeze(["run"]),
  }),
});

export const DEFAULT_CLI_LOCATIONS = Object.freeze({
  CUSTOM_BASE_DIR: "/opt/model-connector",
  CUSTOM_BIN_DIR: "/opt/model-connector/bin",
  CUSTOM_CACHE_DIR: "/opt/model-connector/cache",
  CUSTOM_NPM_PREFIX: "/opt/model-connector/npm",
  CUSTOM_MODELS_DIR: "/opt/model-connector/models",
});
