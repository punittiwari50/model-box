import {
  coreRestClient,
  distributedProviderModelCache,
  type IRestClient,
  type IDistributedProviderModelCacheRegistry,
  type IModelProviderDiscoveryStrategy,
  type ProviderDiscoveryDescriptor,
} from "@model-box/model-connector-core";

export interface ApplicationConnectorDescriptor {
  readonly applicationId: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly modelsDiscoveryPath: string;
  readonly invokePath: string;
  readonly defaultModels: readonly string[];
  readonly bearerToken?: string;
}

export interface ApplicationInvocationRequest {
  readonly applicationId: string;
  readonly modelId: string;
  readonly prompt: string;
  readonly correlationId?: string;
  readonly bearerToken?: string;
}

export interface ApplicationInvocationResponse {
  readonly applicationId: string;
  readonly modelId: string;
  readonly outputText: string;
  readonly statusCode: number;
}

/**
 * Strategy interface for connecting to downstream AI-enabled applications (STD-COD-005).
 */
export interface IApplicationConnectorStrategy {
  readonly strategyId: string;
  discoverAvailableModels(descriptor: ApplicationConnectorDescriptor): Promise<readonly string[]>;
  invokeApplicationModel(
    descriptor: ApplicationConnectorDescriptor,
    request: ApplicationInvocationRequest,
  ): Promise<ApplicationInvocationResponse>;
}

/**
 * REST-based Application Connector Strategy with W3C TraceContext propagation.
 */
export class RestApplicationConnectorStrategy implements IApplicationConnectorStrategy {
  public readonly strategyId = "rest-application";

  constructor(private readonly restClient: IRestClient = coreRestClient) {}

  public async discoverAvailableModels(
    descriptor: ApplicationConnectorDescriptor,
  ): Promise<readonly string[]> {
    const url = `${descriptor.baseUrl.replace(/\/+$/, "")}${descriptor.modelsDiscoveryPath}`;
    const response = await this.restClient.get<{ readonly models?: readonly string[] }>(url, {
      headers: this.buildHeaders(descriptor.bearerToken),
    });
    const list = response.data?.models ?? [];
    return list.length > 0 ? Object.freeze([...list]) : descriptor.defaultModels;
  }

  public async invokeApplicationModel(
    descriptor: ApplicationConnectorDescriptor,
    request: ApplicationInvocationRequest,
  ): Promise<ApplicationInvocationResponse> {
    const url = `${descriptor.baseUrl.replace(/\/+$/, "")}${descriptor.invokePath}`;
    const token = request.bearerToken ?? descriptor.bearerToken;
    const response = await this.restClient.post<{ readonly outputText?: string }>(
      url,
      { modelId: request.modelId, prompt: request.prompt },
      { headers: this.buildHeaders(token), correlationId: request.correlationId },
    );
    return Object.freeze({
      applicationId: descriptor.applicationId,
      modelId: request.modelId,
      outputText: response.data?.outputText ?? "",
      statusCode: response.status,
    });
  }

  private buildHeaders(bearerToken?: string): Record<string, string> {
    if (!bearerToken) {
      return {};
    }
    return { Authorization: `Bearer ${bearerToken}` };
  }
}

/**
 * Discovery adapter binding ApplicationConnectorRegistry into the 24h Distributed Model Cache.
 */
export class ApplicationModelDiscoveryCacheStrategy implements IModelProviderDiscoveryStrategy {
  constructor(
    public readonly providerId: string,
    private readonly registry: ApplicationConnectorRegistry,
  ) {}

  public async discoverAvailableModels(
    descriptor: ProviderDiscoveryDescriptor,
  ): Promise<readonly string[]> {
    return this.registry.discoverUncachedModels(descriptor.providerId);
  }
}

/**
 * Distributed Application Connector Registry managing application-bound model discovery & invocation.
 */
export class ApplicationConnectorRegistry {
  private readonly applications = new Map<string, ApplicationConnectorDescriptor>();
  private readonly strategy: IApplicationConnectorStrategy;
  private readonly cacheRegistry: IDistributedProviderModelCacheRegistry;

  constructor(
    strategy: IApplicationConnectorStrategy = new RestApplicationConnectorStrategy(),
    cacheRegistry: IDistributedProviderModelCacheRegistry = distributedProviderModelCache,
  ) {
    this.strategy = strategy;
    this.cacheRegistry = cacheRegistry;
  }

  public registerApplication(descriptor: ApplicationConnectorDescriptor): void {
    this.applications.set(descriptor.applicationId, descriptor);
    this.cacheRegistry.registerStrategy(
      new ApplicationModelDiscoveryCacheStrategy(descriptor.applicationId, this),
    );
  }

  public getApplication(applicationId: string): ApplicationConnectorDescriptor {
    const app = this.applications.get(applicationId);
    if (!app) {
      throw new Error(`Application '${applicationId}' is not registered`);
    }
    return app;
  }

  public async getAvailableModelsCached(
    applicationId: string,
    forceRefresh = false,
  ): Promise<readonly string[]> {
    const app = this.getApplication(applicationId);
    return this.cacheRegistry.getAvailableModels(
      {
        providerId: app.applicationId,
        baseUrl: app.baseUrl,
        apiVersion: "v1",
        tagsPath: app.modelsDiscoveryPath,
        seedKeywords: app.defaultModels,
      },
      forceRefresh,
    );
  }

  public async discoverUncachedModels(applicationId: string): Promise<readonly string[]> {
    const app = this.getApplication(applicationId);
    try {
      return await this.strategy.discoverAvailableModels(app);
    } catch {
      return app.defaultModels;
    }
  }

  public async invokeApplication(
    request: ApplicationInvocationRequest,
  ): Promise<ApplicationInvocationResponse> {
    const app = this.getApplication(request.applicationId);
    return this.strategy.invokeApplicationModel(app, request);
  }
}

export const applicationConnectorRegistry = new ApplicationConnectorRegistry();
