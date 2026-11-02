import {
  environment,
  ollamaModelDiscoveryCache,
  type IOllamaModelDiscoveryCache,
} from "@model-box/model-connector-core";
import {
  DefaultEndpoint,
  DefaultCliCommand,
  HttpHeader,
  ModelFamily,
} from "@/domain/constants/index.js";
import type {
  ApiRequestSpec,
  CliCommandSpec,
  IModelPropertyResolver,
} from "@/domain/resolvers/IModelPropertyResolver.js";

/**
 * Property & Protocol Resolver for Ollama local air-gapped runtimes.
 * Uses 24-hour TTL OllamaModelDiscoveryCacheService and application.yml properties via DI.
 */
export class OllamaModelPropertyResolver implements IModelPropertyResolver {
  public readonly family = ModelFamily.OLLAMA;

  constructor(
    private readonly ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
  ) {}

  public supports(model: string): boolean {
    return this.ollamaCache.isOllamaModel(model);
  }

  public resolveApiKey(_model: string): string | undefined {
    return undefined;
  }

  public resolveBaseUrl(): string {
    return environment.getProperty(
      "ollama.base.url",
      environment.getProperty("providers.ollama.baseUrl", DefaultEndpoint.OLLAMA_API_BASE_URL),
    );
  }

  public buildApiRequest(model: string, _apiKey: string, prompt: string): ApiRequestSpec {
    const baseUrl = this.resolveBaseUrl();
    const generatePath = environment.getProperty("providers.ollama.generatePath", "/api/generate");
    return {
      endpoint: `${baseUrl.replace(/\/$/, "")}${generatePath}`,
      headers: {
        [HttpHeader.CONTENT_TYPE]: "application/json",
      },
      body: {
        model,
        prompt,
        stream: false,
      },
    };
  }

  public resolveCliCommand(model: string, _sessionId?: string): CliCommandSpec {
    const binary = environment.getProperty(
      "ollama.cli.command",
      environment.getProperty("providers.ollama.cliExecutable", DefaultCliCommand.OLLAMA),
    );
    const baseUrl = this.resolveBaseUrl();
    return {
      binary,
      args: ["run", model],
      env: Object.freeze({
        OLLAMA_HOST: baseUrl,
      }),
    };
  }
}
