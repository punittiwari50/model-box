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
 * Property & Protocol Resolver for Google Gemini frontier models.
 */
export class GeminiModelPropertyResolver implements IModelPropertyResolver {
  public readonly family = ModelFamily.GEMINI;

  public supports(model: string): boolean {
    return model.toLowerCase().includes(ModelFamily.GEMINI);
  }

  public resolveApiKey(_model: string): string | undefined {
    return (
      environment.getProperty("gemini.api.key") ||
      environment.getProperty("google.api.key") ||
      environment.getProperty("api.key")
    );
  }

  public resolveBaseUrl(): string {
    return environment.getProperty(
      "gemini.api.base.url",
      DefaultEndpoint.GEMINI_API_BASE_URL,
    );
  }

  public buildApiRequest(model: string, apiKey: string, prompt: string): ApiRequestSpec {
    const baseUrl = this.resolveBaseUrl();
    const isOAuth = apiKey.startsWith("ya29.") || apiKey.startsWith("Bearer ");
    const cleanToken = apiKey.startsWith("Bearer ") ? apiKey.slice(7) : apiKey;
    const endpoint = isOAuth
      ? `${baseUrl}/v1beta/models/${model}:generateContent`
      : `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const headers: Record<string, string> = {
      [HttpHeader.CONTENT_TYPE]: "application/json",
    };
    if (isOAuth) {
      headers["Authorization"] = `Bearer ${cleanToken}`;
    } else {
      headers[HttpHeader.X_GOOG_API_KEY] = apiKey;
    }
    return {
      endpoint,
      headers,
      body: {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      },
    };
  }

  public resolveCliCommand(
    model: string,
    sessionId?: string,
    credentialValue?: string,
  ): CliCommandSpec {
    const binary = environment.getProperty(
      "google.cli.executable",
      environment.getProperty("gemini.cli.command", DefaultCliCommand.GEMINI),
    );
    const isAntigravity = binary.includes("antigravity") || binary.includes("agy");
    const args = this.buildCliArgs(isAntigravity, model, sessionId);
    return { binary, args, env: this.buildCliEnv(credentialValue) };
  }

  private buildCliArgs(isAntigravity: boolean, model: string, sessionId?: string): string[] {
    const args: string[] = isAntigravity
      ? ["-p", "", "--output-format", "json"]
      : ["--prompt", "", "-o", "json", "--skip-trust"];
    if (model && model !== "gemini") {
      args.push(isAntigravity ? "--model" : "-m", model);
    }
    if (sessionId) {
      args.push(isAntigravity ? "--conversation" : "--session-id", sessionId);
    }
    return args;
  }

  private buildCliEnv(credentialValue?: string): Readonly<Record<string, string>> {
    const envVars: Record<string, string> = {
      GEMINI_CLI_TRUST_WORKSPACE: "true",
    };
    const token = credentialValue?.trim() || this.resolveApiKey("");
    if (!token) {
      return Object.freeze(envVars);
    }
    const cleanToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token;
    if (cleanToken.startsWith("ya29.")) {
      envVars.GOOGLE_GENAI_USE_GCA = "true";
      envVars.GOOGLE_CLOUD_ACCESS_TOKEN = cleanToken;
    } else {
      envVars.GEMINI_API_KEY = cleanToken;
      envVars.GOOGLE_API_KEY = cleanToken;
    }
    return Object.freeze(envVars);
  }
}
