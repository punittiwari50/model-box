import {
  cliOAuthSessionRepository,
  type CliOAuthSession,
} from "@/database/CliOAuthSessionRepository.js";
import { childProcessUtils } from "@/utils/process/childProcessUtils.js";
import { fileUtils } from "@/utils/file/fileUtils.js";
import { pathUtils } from "@/utils/file/pathUtils.js";
import { processUtils } from "@/utils/process/processUtils.js";
import { logger } from "@/logging/logger.js";
import { CliOAuthConstants } from "@/constants/index.js";

export interface CliTriggerOptions {
  readonly userEmail?: string;
  readonly accountCategory?: "individual" | "enterprise";
  readonly customCallbackUrl?: string;
  readonly clientId?: string;
  readonly modelId?: string;
}

export interface ICliAuthStrategy {
  readonly provider: string;
  readonly defaultModelId: string;
  readonly cliBinary: string;
  readonly scriptName: string;
  supports(modelId: string): boolean;
  triggerAuth(options?: CliTriggerOptions): Promise<CliOAuthSession>;
  getLatestSession(): CliOAuthSession | null;
  submitAuthCode(sessionId: string, authCode: string): Promise<CliOAuthSession>;
}

export abstract class AbstractCliAuthStrategy implements ICliAuthStrategy {
  public abstract readonly provider: string;
  public abstract readonly defaultModelId: string;
  public abstract readonly cliBinary: string;
  public abstract readonly scriptName: string;

  public abstract supports(modelId: string): boolean;

  public resolveScriptPath(): string {
    const candidates = [
      `/app/config/scripts/${this.scriptName}`,
      pathUtils.resolve(processUtils.cwd(), "config", "scripts", this.scriptName),
      pathUtils.resolve(processUtils.cwd(), "..", "config", "scripts", this.scriptName),
    ];
    return candidates.find((c) => fileUtils.exists(c)) ?? candidates[0];
  }

  public async triggerAuth(options?: CliTriggerOptions): Promise<CliOAuthSession> {
    const scriptPath = this.resolveScriptPath();
    if (!fileUtils.exists(scriptPath)) {
      return this.createErrorSession(
        `Script ${this.scriptName} not found at ${scriptPath}`,
        "SCRIPT_NOT_FOUND",
      );
    }

    this.spawnScriptProcess(scriptPath, options);
    return this.pollForSessionResult(options?.customCallbackUrl);
  }

  private spawnScriptProcess(scriptPath: string, options?: CliTriggerOptions): void {
    try {
      const args: string[] = [];
      if (options?.userEmail) {
        args.push("--email", options.userEmail);
      }
      if (options?.clientId) {
        args.push("--client", options.clientId);
      }
      if (options?.modelId) {
        args.push("--model", options.modelId);
      }
      const child = childProcessUtils.spawn(scriptPath, args, {
        detached: true,
        stdio: "ignore",
        env: {
          ...processUtils.env,
          MODEL_ID: options?.modelId || this.defaultModelId,
          PROVIDER: this.provider,
          USER_EMAIL: options?.userEmail || "",
          CLIENT_ID: options?.clientId || "default",
        },
      });
      child.unref();
      logger.info(
        `[${this.constructor.name}] Spawned ${this.scriptName} in background for user ${options?.userEmail || "unspecified"} (client: ${options?.clientId || "default"}).`,
      );
    } catch (err: unknown) {
      logger.error(`[${this.constructor.name}] Failed to spawn ${this.scriptName}: ${String(err)}`);
    }
  }

  private async pollForSessionResult(customCallbackUrl?: string): Promise<CliOAuthSession> {
    const appCallback = customCallbackUrl || "http://localhost:8085/oauth2callback";
    for (let i = 0; i < 15; i++) {
      await this.delay(400);
      cliOAuthSessionRepository.syncAll();
      const session = this.getLatestSession();
      if (session) {
        return this.adaptSessionWithAppCallback(session, appCallback);
      }
    }
    return this.createErrorSession(
      `Timed out waiting for ${this.cliBinary} OAuth session generation.`,
      "TIMEOUT",
    );
  }

  private adaptSessionWithAppCallback(
    session: CliOAuthSession,
    appCallbackUrl: string,
  ): CliOAuthSession {
    if (!session.oauthUrl) return session;

    try {
      const parsed = new URL(session.oauthUrl);
      const originalCliRedirect = parsed.searchParams.get("redirect_uri") || session.cliRedirectUri || "";

      const adapted: CliOAuthSession = {
        ...session,
        oauthUrl: session.oauthUrl,
        cliRedirectUri: originalCliRedirect,
        appRedirectUri: appCallbackUrl,
      };
      cliOAuthSessionRepository.upsertSession(adapted);
      return adapted;
    } catch {
      return session;
    }
  }

  private createErrorSession(errorMessage: string, errorCode: string): CliOAuthSession {
    const sessionId = `err-${Date.now()}`;
    const now = new Date().toISOString();
    const errorSession: CliOAuthSession = {
      sessionId,
      provider: this.provider,
      modelId: this.defaultModelId,
      authMode: `${this.provider} CLI OAuth`,
      oauthUrl: "",
      status: "FAILED",
      errorMessage,
      errorCode,
      createdAt: now,
      updatedAt: now,
    };
    cliOAuthSessionRepository.upsertSession(errorSession);
    return errorSession;
  }

  public getLatestSession(): CliOAuthSession | null {
    cliOAuthSessionRepository.syncAll();
    return (
      cliOAuthSessionRepository.getLatestPendingSession(this.defaultModelId) ||
      cliOAuthSessionRepository.getLatestSession(this.defaultModelId)
    );
  }

  public async submitAuthCode(sessionId: string, authCode: string): Promise<CliOAuthSession> {
    cliOAuthSessionRepository.updateAuthCode(sessionId, authCode);
    const triggerFile = CliOAuthConstants.AUTH_CODE_TRIGGER_FILE;
    try {
      fileUtils.writeFileSync(triggerFile, authCode.trim());
    } catch {
      // Best-effort trigger
    }
    cliOAuthSessionRepository.syncAll();
    return cliOAuthSessionRepository.getSessionById(sessionId)!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class AntigravityCliAuthStrategy extends AbstractCliAuthStrategy {
  public readonly provider = "google";
  public readonly defaultModelId = "gemini-3.8-flash";
  public readonly cliBinary = "antigravity";
  public readonly scriptName = "antigravity-auth-daemon.sh";

  public supports(modelId: string): boolean {
    const m = modelId.toLowerCase();
    return m.includes("gemini") || m.includes("antigravity") || m.includes("google");
  }
}

export class ClaudeCliAuthStrategy extends AbstractCliAuthStrategy {
  public readonly provider = "anthropic";
  public readonly defaultModelId = "claude-3-7-sonnet";
  public readonly cliBinary = "claude";
  public readonly scriptName = "claude-auth-daemon.sh";

  public supports(modelId: string): boolean {
    return modelId.toLowerCase().includes("claude");
  }
}

export class ChatGptCliAuthStrategy extends AbstractCliAuthStrategy {
  public readonly provider = "openai";
  public readonly defaultModelId = "gpt-4o";
  public readonly cliBinary = "chatgpt";
  public readonly scriptName = "chatgpt-auth-daemon.sh";

  public supports(modelId: string): boolean {
    const m = modelId.toLowerCase();
    return m.includes("gpt") || m.includes("chatgpt") || m.includes("codex") || m.includes("openai");
  }
}

export class CopilotCliAuthStrategy extends AbstractCliAuthStrategy {
  public readonly provider = "github";
  public readonly defaultModelId = "copilot-gpt-4o";
  public readonly cliBinary = "github-copilot-cli";
  public readonly scriptName = "copilot-auth-daemon.sh";

  public supports(modelId: string): boolean {
    return modelId.toLowerCase().includes("copilot");
  }
}

export class CliAuthStrategyFactory {
  private static strategies: ICliAuthStrategy[] = [
    new AntigravityCliAuthStrategy(),
    new ClaudeCliAuthStrategy(),
    new ChatGptCliAuthStrategy(),
    new CopilotCliAuthStrategy(),
  ];

  public static registerStrategy(strategy: ICliAuthStrategy): void {
    this.strategies.unshift(strategy);
  }

  public static getStrategy(modelId: string): ICliAuthStrategy {
    const matched = this.strategies.find((s) => s.supports(modelId));
    return matched ?? this.strategies[0]; // Defaults to Antigravity / Google
  }

  public static getAllStrategies(): readonly ICliAuthStrategy[] {
    return Object.freeze([...this.strategies]);
  }
}
