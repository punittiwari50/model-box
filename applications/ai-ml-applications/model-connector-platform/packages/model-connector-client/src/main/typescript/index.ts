/**
 * Public exports for @model-box/model-connector-client
 */

export * from "@/domain/constants/index.js";
export * from "@/domain/models/model.types.js";
export * from "@/domain/models/execution.types.js";
export * from "@/domain/models/session.types.js";
export * from "@/domain/models/grounding.types.js";
export * from "@/domain/models/geminiOAuth.types.js";
export * from "@/domain/errors/domainExceptions.js";
export * from "@/domain/policies/index.js";
export * from "@/domain/resolvers/index.js";

export * from "@/strategies/IConnectorStrategy.js";
export * from "@/strategies/cli/CliConnectorStrategy.js";
export * from "@/strategies/cli/CliProcessManager.js";
export * from "@/strategies/cli/CliExecutionCoordinator.js";
export * from "@/strategies/api/ApiConnectorStrategy.js";
export * from "@/strategies/api/HttpTransport.js";
export * from "@/strategies/cookie/CookieConnectorStrategy.js";
export * from "@/strategies/cookie/SessionLineageManager.js";
export * from "@/strategies/oauth/OAuthConnectorStrategy.js";
export * from "@/strategies/oauth/ModelOAuthStrategyRegistry.js";
export * from "@/auth/ModelOAuthProviderService.js";
export * from "@/auth/ModelAccountRepository.js";
export * from "@/auth/GeminiCliSessionAuthManager.js";

// Security & Cryptographic Vault
export * from "@/security/CookieVaultManager.js";
export * from "@/security/AuthRevocationTrap.js";
export * from "@/security/UserModelCredentialResolver.js";

// Grounding Engine
export * from "@/grounding/GoogleSearchAiGroundingEngine.js";

// Functional multi-model adapters
export * from "@/adapters/UnifiedModelExecutionAdapter.js";
export * from "@/adapters/ModelCatalogDiscoveryAdapter.js";
export * from "@/adapters/GeminiConnectorAdapter.js";
export * from "@/adapters/ClaudeConnectorAdapter.js";
export * from "@/adapters/GrokConnectorAdapter.js";
export * from "@/adapters/CopilotConnectorAdapter.js";
export * from "@/adapters/OpenAIConnectorAdapter.js";
export * from "@/adapters/OllamaConnectorAdapter.js";
export * from "@/adapters/OllamaDockerFallbackConnector.js";

export * from "@/client/ModelConnectorClient.js";
export * from "@/client/ClientFactory.js";
export * from "@/client/DynamicFallbackCascadeHandler.js";

// Omni-Connectivity: MCP (Model Context Protocol) Tools & Application Bridge
export * from "@/mcp/McpClientConnector.js";
export * from "@/applications/ApplicationConnectorBridge.js";
