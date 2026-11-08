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
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
}

export interface ICliAuthStrategy {
  readonly provider: string;
  readonly defaultModelId: string;
  readonly cliBinary: string;
  readonly scriptName: string;
  supports(modelId: string): boolean;
  triggerAuth(options?: CliTriggerOptions): Promise<CliOAuthSession>;
  getLatestSession(modelId?: string): CliOAuthSession | null;
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

    const sessionId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.spawnScriptProcess(scriptPath, sessionId, options);
    return this.pollForSessionResult(sessionId, options?.customCallbackUrl, options?.modelId || this.defaultModelId);
  }

  private spawnScriptProcess(scriptPath: string, sessionId: string, options?: CliTriggerOptions): void {
    try {
      const args: string[] = ["--session-id", sessionId];
      if (options?.userEmail) {
        args.push("--email", options.userEmail);
      }
      if (options?.clientId) {
        args.push("--client", options.clientId);
      }
      if (options?.modelId) {
        args.push("--model", options.modelId);
      }
      if (options?.correlationId) {
        args.push("--correlation-id", options.correlationId);
      }
      if (options?.traceId) {
        args.push("--trace-id", options.traceId);
      }
      if (options?.spanId) {
        args.push("--span-id", options.spanId);
      }
      if (options?.parentSpanId) {
        args.push("--parent-span-id", options.parentSpanId);
      }
      const child = childProcessUtils.spawn(scriptPath, args, {
        detached: true,
        stdio: ["ignore", "inherit", "inherit"],
        env: {
          ...processUtils.env,
          SESSION_ID: sessionId,
          MODEL_ID: options?.modelId || this.defaultModelId,
          PROVIDER: this.provider,
          USER_EMAIL: options?.userEmail || "",
          CLIENT_ID: options?.clientId || "default",
          CORRELATION_ID: options?.correlationId || "",
          TRACE_ID: options?.traceId || "",
          SPAN_ID: options?.spanId || "",
          PARENT_SPAN_ID: options?.parentSpanId || "",
        },
      });
      child.unref();
      logger.info(
        `[${this.constructor.name}] Spawned ${this.scriptName} for session ${sessionId} (user: ${options?.userEmail || "unspecified"}).`,
        {
          sessionId,
          correlationId: options?.correlationId,
          traceId: options?.traceId,
          spanId: options?.spanId,
        },
      );
    } catch (err: unknown) {
      logger.error(`[${this.constructor.name}] Failed to spawn ${this.scriptName}: ${String(err)}`, err, {
        sessionId,
        correlationId: options?.correlationId,
      });
    }
  }

  private async pollForSessionResult(
    sessionId: string,
    customCallbackUrl?: string,
    modelId?: string,
  ): Promise<CliOAuthSession> {
    const appCallback = customCallbackUrl || "http://localhost:8085/oauth2callback";
    for (let i = 0; i < 30; i++) {
      await this.delay(400);
      cliOAuthSessionRepository.syncAll();
      const session = cliOAuthSessionRepository.getSessionById(sessionId);
      if (session && this.isValidOAuthUrl(session.oauthUrl)) {
        return this.adaptSessionWithAppCallback(session, appCallback);
      }
      const latest = this.getLatestSession(modelId);
      if (latest && latest.sessionId === sessionId && this.isValidOAuthUrl(latest.oauthUrl)) {
        return this.adaptSessionWithAppCallback(latest, appCallback);
      }
    }

    const fallback = this.getLatestSession(modelId);
    if (fallback && this.isValidOAuthUrl(fallback.oauthUrl)) {
      return this.adaptSessionWithAppCallback(fallback, appCallback);
    }

    return this.createErrorSession(
      `Timed out waiting for ${this.cliBinary} OAuth session generation.`,
      "TIMEOUT",
    );
  }

  private isValidOAuthUrl(url?: string): boolean {
    if (!url) return false;
    const trimmed = url.trim();
    return (trimmed.startsWith("http://") || trimmed.startsWith("https://")) && trimmed.length > 20;
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

  public getLatestSession(modelId?: string): CliOAuthSession | null {
    cliOAuthSessionRepository.syncAll();
    const targetModel = modelId || this.defaultModelId;
    return (
      cliOAuthSessionRepository.getLatestPendingSession(targetModel) ||
      cliOAuthSessionRepository.getLatestSession(targetModel)
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
