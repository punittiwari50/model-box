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
 * Fallback Property & Protocol Resolver for unspecified or generic models.
 */
export class GenericFallbackModelPropertyResolver implements IModelPropertyResolver {
  public readonly family = ModelFamily.GENERIC;

  public supports(_model: string): boolean {
    return true;
  }

  public resolveApiKey(_model: string): string | undefined {
    return environment.getProperty("api.key");
  }

  public resolveBaseUrl(): string {
    return environment.getProperty(
      "api.base.url",
      DefaultEndpoint.GEMINI_API_BASE_URL,
    );
  }

  public buildApiRequest(model: string, apiKey: string, prompt: string): ApiRequestSpec {
    const baseUrl = this.resolveBaseUrl();
    return {
      endpoint: `${baseUrl}/v1beta/models/${model}:generateContent`,
      headers: {
        [HttpHeader.CONTENT_TYPE]: "application/json",
        [HttpHeader.X_GOOG_API_KEY]: apiKey,
      },
      body: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      },
    };
  }

  public resolveCliCommand(model: string, sessionId?: string): CliCommandSpec {
    const binary = environment.getProperty("default.cli.command", DefaultCliCommand.DEFAULT);
    const args: string[] = ["-m", model, "--non-interactive", "-o", "json"];
    if (sessionId) {
      args.push("--resume", sessionId);
    }
    return { binary, args };
  }
}
