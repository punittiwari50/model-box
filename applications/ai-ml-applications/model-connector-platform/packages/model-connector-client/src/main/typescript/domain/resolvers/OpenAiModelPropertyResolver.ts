import { environment } from "@model-box/model-connector-core";
import {
  DefaultEndpoint,
  HttpHeader,
  ModelFamily,
} from "@/domain/constants/index.js";
import type {
  ApiRequestSpec,
  CliCommandSpec,
  IModelPropertyResolver,
} from "@/domain/resolvers/IModelPropertyResolver.js";

/**
 * Property & Protocol Resolver for OpenAI / ChatGPT models.
 */
export class OpenAiModelPropertyResolver implements IModelPropertyResolver {
  public readonly family = ModelFamily.OPENAI;

  public supports(model: string): boolean {
    const lower = model.toLowerCase();
    if (lower.includes(ModelFamily.CHATGPT)) {
      return true;
    }
    if (lower.includes(ModelFamily.OPENAI)) {
      return true;
    }
    if (lower.startsWith("gpt-")) {
      return true;
    }
    return lower.startsWith("o1-");
  }

  public resolveApiKey(_model: string): string | undefined {
    return environment.getProperty("openai.api.key") || environment.getProperty("api.key");
  }

  public resolveBaseUrl(): string {
    return environment.getProperty(
      "openai.api.base.url",
      DefaultEndpoint.OPENAI_API_BASE_URL,
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
    const binary = environment.getProperty("chatgpt.cli.command", "chatgpt");
    return {
      binary,
      args: ["--model", model],
    };
  }
}
