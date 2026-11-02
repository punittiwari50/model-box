import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OllamaConnectorAdapter,
  UnauthenticatedOllamaModeStrategy,
  OAuthAuthenticatedOllamaModeStrategy,
  McpClientConnector,
  ApplicationConnectorRegistry,
  type IMcpTransportStrategy,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpServerConfig,
  type IApplicationConnectorStrategy,
  type ApplicationConnectorDescriptor,
  type ApplicationInvocationRequest,
  type ApplicationInvocationResponse,
} from "@model-box/model-connector-client";
import {
  type IRestClient,
  type RestRequestOptions,
  type RestResponse,
} from "@model-box/model-connector-core";
import { OllamaOAuthGatewayServer } from "@/services/ollamaOAuthGatewayServer";

class StubRestClient implements IRestClient {
  public lastHeaders: Record<string, string> = {};
  public lastUrl = "";

  public async request<TData = unknown>(
    url: string,
    options?: RestRequestOptions,
  ): Promise<RestResponse<TData>> {
    this.lastUrl = url;
    this.lastHeaders = { ...(options?.headers ?? {}) };
    return {
      status: 200,
      ok: true,
      rawText: "{}",
      latencyMs: 5,
      correlationId: "test-corr-id",
      data: {
        models: [{ name: "lfm3-omni:latest" }],
        response: "Verified dual-mode Ollama response",
        authenticatedEmail: "ollama.operator@model-connector.local",
      } as unknown as TData,
    };
  }

  public async get<TData = unknown>(
    url: string,
    options?: Omit<RestRequestOptions, "method" | "body">,
  ): Promise<RestResponse<TData>> {
    return this.request<TData>(url, { ...options, method: "GET" });
  }

  public async post<TData = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<RestRequestOptions, "method" | "body">,
  ): Promise<RestResponse<TData>> {
    return this.request<TData>(url, { ...options, method: "POST", body });
  }
}

class StubMcpTransport implements IMcpTransportStrategy {
  public readonly transportType = "http" as const;
  public callCount = 0;

  public async sendRpc<TResult = unknown>(
    _serverConfig: McpServerConfig,
    request: McpJsonRpcRequest,
  ): Promise<McpJsonRpcResponse<TResult>> {
    this.callCount += 1;
    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [
            { name: "query_database", description: "Query database", inputSchema: {} },
            { name: "search_docs", description: "Search docs", inputSchema: {} },
          ],
        } as unknown as TResult,
      };
    }
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: "MCP tool executed" }],
        isError: false,
      } as unknown as TResult,
    };
  }
}

class StubAppConnectorStrategy implements IApplicationConnectorStrategy {
  public readonly strategyId = "stub-app";
  public discoverCalls = 0;

  public async discoverAvailableModels(
    descriptor: ApplicationConnectorDescriptor,
  ): Promise<readonly string[]> {
    this.discoverCalls += 1;
    return descriptor.defaultModels;
  }

  public async invokeApplicationModel(
    descriptor: ApplicationConnectorDescriptor,
    request: ApplicationInvocationRequest,
  ): Promise<ApplicationInvocationResponse> {
    return {
      applicationId: descriptor.applicationId,
      modelId: request.modelId,
      outputText: `Executed ${request.modelId} on ${descriptor.displayName}`,
      statusCode: 200,
    };
  }
}

describe("Dual Ollama Auth Modes (Without OAuth & With OAuth) and MCP + Application Connectivity", () => {
  it("supports Ollama Use Case 1 (WITHOUT OAuth) and Use Case 2 (WITH OAuth 2.0)", async () => {
    const stubRest = new StubRestClient();
    const adapter = new OllamaConnectorAdapter([
      new UnauthenticatedOllamaModeStrategy(stubRest),
      new OAuthAuthenticatedOllamaModeStrategy(stubRest),
    ]);

    // Use Case 1: Without OAuth
    const unauthResult = await adapter.executeDualModeCompletion(
      "NONE",
      "lfm3-omni:latest",
      "Hello without OAuth",
    );
    assert.equal(unauthResult.authMode, "NONE");
    assert.equal(stubRest.lastHeaders.Authorization, undefined);

    // Use Case 2: With OAuth 2.0 via OllamaOAuthGatewayServer
    const gateway = new OllamaOAuthGatewayServer();
    const issuedToken = gateway.issueAccessToken("ollama.operator@model-connector.local", "ollama-client-1");
    assert.ok(issuedToken.accessToken.startsWith("oat_ollama_"));
    assert.equal(gateway.verifyBearerToken(issuedToken.accessToken)?.email, "ollama.operator@model-connector.local");
    assert.equal(gateway.verifyBearerToken("invalid_token"), null);

    const oauthResult = await adapter.executeDualModeCompletion(
      "OAUTH",
      "lfm3-omni:latest",
      "Hello with OAuth",
      issuedToken.accessToken,
    );
    assert.equal(oauthResult.authMode, "OAUTH");
    assert.equal(stubRest.lastHeaders.Authorization, `Bearer ${issuedToken.accessToken}`);
    assert.equal(oauthResult.authenticatedIdentity, "ollama.operator@model-connector.local");
  });

  it("connects to MCP servers and Enterprise Applications with 24-hour discovery caching (Req 1 & Req 6)", async () => {
    const mcpTransport = new StubMcpTransport();
    const mcpConnector = new McpClientConnector([mcpTransport]);
    mcpConnector.registerServer({
      serverId: "mcp-enterprise-tools",
      transportType: "http",
      endpointUrl: "http://localhost:9090/mcp",
    });

    const toolsFirst = await mcpConnector.discoverToolNamesCached("mcp-enterprise-tools", true);
    assert.deepEqual(toolsFirst, ["query_database", "search_docs"]);
    assert.equal(mcpTransport.callCount, 1);

    const toolsCached = await mcpConnector.discoverToolNamesCached("mcp-enterprise-tools", false);
    assert.deepEqual(toolsCached, ["query_database", "search_docs"]);
    assert.equal(mcpTransport.callCount, 1, "MCP tools must be served from 24h distributed cache");

    const callRes = await mcpConnector.callTool("mcp-enterprise-tools", "query_database", { sql: "SELECT 1" });
    assert.equal(callRes.isError, false);
    assert.equal(callRes.content[0]?.text, "MCP tool executed");

    const appStrategy = new StubAppConnectorStrategy();
    const appRegistry = new ApplicationConnectorRegistry(appStrategy);
    appRegistry.registerApplication({
      applicationId: "app-copilot-studio",
      displayName: "Copilot Studio App",
      baseUrl: "http://localhost:9091",
      modelsDiscoveryPath: "/api/models",
      invokePath: "/api/invoke",
      defaultModels: ["copilot-gpt-4o", "claude-3-7-sonnet"],
    });

    const appModels = await appRegistry.getAvailableModelsCached("app-copilot-studio", true);
    assert.deepEqual(appModels, ["copilot-gpt-4o", "claude-3-7-sonnet"]);
    assert.equal(appStrategy.discoverCalls, 1);

    await appRegistry.getAvailableModelsCached("app-copilot-studio", false);
    assert.equal(appStrategy.discoverCalls, 1, "Application models must be served from 24h distributed cache");
  });
});
