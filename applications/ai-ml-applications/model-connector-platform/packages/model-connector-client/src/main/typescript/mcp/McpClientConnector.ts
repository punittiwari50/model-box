import {
  coreRestClient,
  distributedProviderModelCache,
  childProcessUtils,
  cryptoUtils,
  type IRestClient,
  type IDistributedProviderModelCacheRegistry,
  type IModelProviderDiscoveryStrategy,
  type ProviderDiscoveryDescriptor,
} from "@model-box/model-connector-core";

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const MCP_JSONRPC_VERSION = "2.0";
export const MCP_DEFAULT_TIMEOUT_MS = 10_000;

export interface McpJsonRpcRequest {
  readonly jsonrpc: string;
  readonly id: string;
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface McpJsonRpcResponse<TResult = unknown> {
  readonly jsonrpc: string;
  readonly id: string;
  readonly result?: TResult;
  readonly error?: {
    readonly code: number;
    readonly message: string;
  };
}

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface McpToolCallResult {
  readonly toolName: string;
  readonly serverId: string;
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError: boolean;
}

export interface McpServerConfig {
  readonly serverId: string;
  readonly transportType: "http" | "stdio";
  readonly endpointUrl?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly bearerToken?: string;
  readonly defaultTools?: readonly McpToolDefinition[];
}

/**
 * Strategy interface for Model Context Protocol (MCP) transport execution (STD-COD-005).
 */
export interface IMcpTransportStrategy {
  readonly transportType: "http" | "stdio";
  sendRpc<TResult = unknown>(
    serverConfig: McpServerConfig,
    request: McpJsonRpcRequest,
  ): Promise<McpJsonRpcResponse<TResult>>;
}

/**
 * HTTP JSON-RPC transport strategy for remote MCP servers.
 */
export class HttpMcpTransportStrategy implements IMcpTransportStrategy {
  public readonly transportType = "http" as const;

  constructor(private readonly restClient: IRestClient = coreRestClient) {}

  public async sendRpc<TResult = unknown>(
    serverConfig: McpServerConfig,
    request: McpJsonRpcRequest,
  ): Promise<McpJsonRpcResponse<TResult>> {
    const headers = this.buildAuthHeaders(serverConfig.bearerToken);
    const response = await this.restClient.post<McpJsonRpcResponse<TResult>>(
      serverConfig.endpointUrl ?? "",
      request,
      { headers, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
    );
    return response.data;
  }

  private buildAuthHeaders(bearerToken?: string): Record<string, string> {
    if (!bearerToken) {
      return {};
    }
    return { Authorization: `Bearer ${bearerToken}` };
  }
}

/**
 * Stdio subprocess JSON-RPC transport strategy for local CLI MCP servers.
 */
export class StdioMcpTransportStrategy implements IMcpTransportStrategy {
  public readonly transportType = "stdio" as const;

  public async sendRpc<TResult = unknown>(
    serverConfig: McpServerConfig,
    request: McpJsonRpcRequest,
  ): Promise<McpJsonRpcResponse<TResult>> {
    const command = serverConfig.command ?? "echo";
    const argsStr = [...(serverConfig.args ?? []), request.method].join(" ");
    const fullCmd = `${command} ${argsStr}`.trim();
    const result = await childProcessUtils.exec(fullCmd, {
      timeout: MCP_DEFAULT_TIMEOUT_MS,
    });
    return JSON.parse(result.stdout.trim()) as McpJsonRpcResponse<TResult>;
  }
}

/**
 * Discovery strategy integrating MCP servers with the centralized 24h Distributed Model Cache.
 */
export class McpToolDiscoveryCacheStrategy implements IModelProviderDiscoveryStrategy {
  constructor(
    public readonly providerId: string,
    private readonly connector: McpClientConnector,
  ) {}

  public async discoverAvailableModels(
    descriptor: ProviderDiscoveryDescriptor,
  ): Promise<readonly string[]> {
    const tools = await this.connector.fetchServerToolsUncached(descriptor.providerId);
    return Object.freeze(tools.map((tool) => tool.name));
  }
}

/**
 * Enterprise MCP (Model Context Protocol) Client Connector for Tools, Resources, and Prompts.
 */
export class McpClientConnector {
  private readonly servers = new Map<string, McpServerConfig>();
  private readonly transports = new Map<string, IMcpTransportStrategy>();
  private readonly cacheRegistry: IDistributedProviderModelCacheRegistry;

  constructor(
    transports?: readonly IMcpTransportStrategy[],
    cacheRegistry: IDistributedProviderModelCacheRegistry = distributedProviderModelCache,
  ) {
    this.cacheRegistry = cacheRegistry;
    const strategies = transports ?? [
      new HttpMcpTransportStrategy(),
      new StdioMcpTransportStrategy(),
    ];
    for (const strategy of strategies) {
      this.transports.set(strategy.transportType, strategy);
    }
  }

  public registerServer(config: McpServerConfig): void {
    this.servers.set(config.serverId, config);
    this.cacheRegistry.registerStrategy(new McpToolDiscoveryCacheStrategy(config.serverId, this));
  }

  public getServerConfig(serverId: string): McpServerConfig {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new Error(`MCP server '${serverId}' is not registered`);
    }
    return config;
  }

  public async discoverToolNamesCached(
    serverId: string,
    forceRefresh = false,
  ): Promise<readonly string[]> {
    const config = this.getServerConfig(serverId);
    const fallbackNames = (config.defaultTools ?? []).map((t) => t.name);
    return this.cacheRegistry.getAvailableModels(
      {
        providerId: serverId,
        baseUrl: config.endpointUrl ?? config.command ?? "stdio://mcp",
        apiVersion: "v1",
        seedKeywords: fallbackNames,
      },
      forceRefresh,
    );
  }

  public async fetchServerToolsUncached(serverId: string): Promise<readonly McpToolDefinition[]> {
    const config = this.getServerConfig(serverId);
    try {
      const transport = this.resolveTransport(config.transportType);
      const response = await transport.sendRpc<{ readonly tools?: readonly McpToolDefinition[] }>(
        config,
        this.createRequest("tools/list"),
      );
      return response.result?.tools ?? config.defaultTools ?? [];
    } catch {
      return config.defaultTools ?? [];
    }
  }

  public async callTool(
    serverId: string,
    toolName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<McpToolCallResult> {
    const config = this.getServerConfig(serverId);
    const transport = this.resolveTransport(config.transportType);
    const response = await transport.sendRpc<{
      readonly content?: readonly { readonly type: string; readonly text: string }[];
      readonly isError?: boolean;
    }>(config, this.createRequest("tools/call", { name: toolName, arguments: args }));
    return Object.freeze({
      toolName,
      serverId,
      content: response.result?.content ?? [],
      isError: Boolean(response.result?.isError ?? response.error),
    });
  }

  private resolveTransport(transportType: string): IMcpTransportStrategy {
    const transport = this.transports.get(transportType);
    if (!transport) {
      throw new Error(`Unsupported MCP transport type: ${transportType}`);
    }
    return transport;
  }

  private createRequest(
    method: string,
    params?: Readonly<Record<string, unknown>>,
  ): McpJsonRpcRequest {
    return Object.freeze({
      jsonrpc: MCP_JSONRPC_VERSION,
      id: cryptoUtils.randomUuid(),
      method,
      params,
    });
  }
}

export const mcpClientConnector = new McpClientConnector();
