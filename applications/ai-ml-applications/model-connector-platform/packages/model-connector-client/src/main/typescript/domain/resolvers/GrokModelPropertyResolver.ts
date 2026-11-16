import { environment } from "@model-box/model-connector-core";
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
 * Property & Protocol Resolver for xAI Grok frontier models.
 */
export class GrokModelPropertyResolver implements IModelPropertyResolver {
  public readonly family = ModelFamily.GROK;

  public supports(model: string): boolean {
    const lower = model.toLowerCase();
    if (lower.includes(ModelFamily.GROK)) {
      return true;
    }
    return lower.includes("xai");
  }

  public resolveApiKey(_model: string): string | undefined {
    return environment.getProperty("grok.api.key") || environment.getProperty("api.key");
  }

  public resolveBaseUrl(): string {
    return environment.getProperty(
      "grok.api.base.url",
      DefaultEndpoint.GROK_API_BASE_URL,
    );
  }

  public buildApiRequest(model: string, apiKey: string, prompt: string): ApiRequestSpec {
    const baseUrl = this.resolveBaseUrl();
    return {
      endpoint: `${baseUrl}/chat/completions`,
      headers: {
        [HttpHeader.CONTENT_TYPE]: "application/json",
        [HttpHeader.AUTHORIZATION]: `Bearer ${apiKey}`,
      },
      body: {
        model,
        messages: [{ role: "user", content: prompt }],
      },
    };
  }

  public resolveCliCommand(model: string, _sessionId?: string): CliCommandSpec {
    const binary = environment.getProperty("grok.cli.command", DefaultCliCommand.GROK);
    return {
      binary,
      args: ["--model", model],
    };
  }
}
