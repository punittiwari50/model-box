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
 * Property & Protocol Resolver for Anthropic Claude frontier models.
 */
export class ClaudeModelPropertyResolver implements IModelPropertyResolver {
  public readonly family = ModelFamily.CLAUDE;

  public supports(model: string): boolean {
    const lower = model.toLowerCase();
    if (lower.includes(ModelFamily.CLAUDE)) {
      return true;
    }
    return lower.includes("anthropic");
  }

  public resolveApiKey(_model: string): string | undefined {
    return environment.getProperty("anthropic.api.key") || environment.getProperty("api.key");
  }

  public resolveBaseUrl(): string {
    return environment.getProperty(
      "claude.api.base.url",
      DefaultEndpoint.ANTHROPIC_API_BASE_URL,
    );
  }

  public buildApiRequest(model: string, apiKey: string, prompt: string): ApiRequestSpec {
    const baseUrl = this.resolveBaseUrl();
    const isOAuth = apiKey.startsWith("Bearer ") || apiKey.startsWith("sk-ant-oat");
    const cleanToken = apiKey.startsWith("Bearer ") ? apiKey.slice(7).trim() : apiKey;
    const headers: Record<string, string> = {
      [HttpHeader.CONTENT_TYPE]: "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (isOAuth) {
      headers[HttpHeader.AUTHORIZATION] = `Bearer ${cleanToken}`;
    } else {
      headers[HttpHeader.X_API_KEY] = cleanToken;
    }
    return {
      endpoint: `${baseUrl}/v1/messages`.replace("/v1/v1/", "/v1/"),
      headers,
      body: {
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      },
    };
  }

  public resolveCliCommand(
    model: string,
    sessionId?: string,
    credentialValue?: string,
  ): CliCommandSpec {
    const binary = environment.getProperty("claude.cli.command", DefaultCliCommand.CLAUDE);
    const args: string[] = ["--model", model, "--print", "--output-format", "json"];
    if (sessionId) {
      args.push("--resume", sessionId);
    }
    return { binary, args, env: this.buildCliEnv(credentialValue) };
  }

  private buildCliEnv(credentialValue?: string): Readonly<Record<string, string>> {
    const envVars: Record<string, string> = {};
    const token = credentialValue?.trim() || this.resolveApiKey("");
    if (!token) {
      return Object.freeze(envVars);
    }
    const cleanToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token;
    if (cleanToken.startsWith("sk-ant-oat")) {
      envVars.CLAUDE_CODE_OAUTH_TOKEN = cleanToken;
    } else {
      envVars.ANTHROPIC_API_KEY = cleanToken;
    }
    return Object.freeze(envVars);
  }
}
