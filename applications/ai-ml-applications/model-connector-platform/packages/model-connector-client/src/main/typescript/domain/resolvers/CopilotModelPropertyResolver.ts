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
 * Property & Protocol Resolver for GitHub Copilot developer models.
 */
export class CopilotModelPropertyResolver implements IModelPropertyResolver {
  public readonly family = ModelFamily.COPILOT;

  public supports(model: string): boolean {
    const lower = model.toLowerCase();
    if (lower.includes(ModelFamily.COPILOT)) {
      return true;
    }
    return lower.includes("github");
  }

  public resolveApiKey(_model: string): string | undefined {
    return (
      environment.getProperty("copilot.api.key") ||
      environment.getProperty("copilot.token") ||
      environment.getProperty("github.token") ||
      environment.getProperty("api.key")
    );
  }

  public resolveBaseUrl(): string {
    return environment.getProperty(
      "copilot.api.base.url",
      DefaultEndpoint.COPILOT_API_BASE_URL,
    );
  }

  public buildApiRequest(model: string, apiKey: string, prompt: string): ApiRequestSpec {
    const baseUrl = this.resolveBaseUrl();
    const cleanToken = apiKey.startsWith("Bearer ") ? apiKey.slice(7).trim() : apiKey;
    return {
      endpoint: `${baseUrl}/chat/completions`,
      headers: {
        [HttpHeader.CONTENT_TYPE]: "application/json",
        [HttpHeader.AUTHORIZATION]: `Bearer ${cleanToken}`,
      },
      body: {
        model,
        messages: [{ role: "user", content: prompt }],
      },
    };
  }

  public resolveCliCommand(
    model: string,
    _sessionId?: string,
    credentialValue?: string,
  ): CliCommandSpec {
    const binary = environment.getProperty("copilot.cli.command", DefaultCliCommand.COPILOT);
    return {
      binary,
      args: ["--model", model, "--non-interactive"],
      env: this.buildCliEnv(credentialValue),
    };
  }

  private buildCliEnv(credentialValue?: string): Readonly<Record<string, string>> {
    const envVars: Record<string, string> = {};
    const token = credentialValue?.trim() || this.resolveApiKey("");
    if (!token) {
      return Object.freeze(envVars);
    }
    const cleanToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token;
    envVars.GITHUB_TOKEN = cleanToken;
    envVars.GH_TOKEN = cleanToken;
    envVars.COPILOT_API_KEY = cleanToken;
    return Object.freeze(envVars);
  }
}
