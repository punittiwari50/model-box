import {
  cliOAuthSessionRepository,
  type CliOAuthSession,
} from "@/database/CliOAuthSessionRepository.js";
import {
  providerOAuthClientRepository,
} from "@/database/ProviderOAuthClientRepository.js";
import { childProcessUtils } from "@/utils/process/childProcessUtils.js";
import { fileUtils } from "@/utils/file/fileUtils.js";
import { pathUtils } from "@/utils/file/pathUtils.js";
import { processUtils } from "@/utils/process/processUtils.js";
import { logger } from "@/logging/logger.js";
import { CliOAuthConstants, GoogleAuthConstants } from "@/constants/index.js";

export interface CliTriggerOptions {
  readonly userEmail?: string;
  readonly accountCategory?: "individual" | "enterprise";
  readonly customCallbackUrl?: string;
  readonly clientId?: string;
  readonly cliTool?: string;
  readonly modelId?: string;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly forceRestart?: boolean;
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

    const targetModel = options?.modelId || this.defaultModelId;
    if (!options?.forceRestart) {
      cliOAuthSessionRepository.syncAll();
      const existing = cliOAuthSessionRepository.getLatestPendingSession(targetModel);
      if (existing && this.isValidOAuthUrl(existing.oauthUrl)) {
        const elapsedSec = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
        const maxReuseSeconds = targetModel.toLowerCase().includes("gemini") || targetModel.toLowerCase().includes("antigravity") ? 45 : 120;
        if (elapsedSec < maxReuseSeconds) {
          logger.info(`[${this.constructor.name}] Reusing active pending session ${existing.sessionId} (elapsed: ${Math.round(elapsedSec)}s).`);
          const appCallback = options?.customCallbackUrl || "http://localhost:8085/oauth2callback";
          return this.adaptSessionWithAppCallback(existing, appCallback);
        }
      }
    }

    const sessionId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.spawnScriptProcess(scriptPath, sessionId, options);
    return this.pollForSessionResult(sessionId, options?.customCallbackUrl, targetModel);
  }

  private spawnScriptProcess(scriptPath: string, sessionId: string, options?: CliTriggerOptions): void {
    try {
      const args: string[] = ["--session-id", sessionId];
      const resolvedUserEmail = options?.userEmail?.trim() || "";
      if (resolvedUserEmail) {
        args.push("--email", resolvedUserEmail);
      }
      const activeClient = providerOAuthClientRepository.resolveActiveClient(this.provider, options?.modelId);
      const effectiveClientId = options?.clientId?.trim() || activeClient?.clientId || "";
      if (effectiveClientId) {
        args.push("--client", effectiveClientId);
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
          HOME: "/home/node",
          USER: "node",
          SESSION_ID: sessionId,
          MODEL_ID: options?.modelId || this.defaultModelId,
          PROVIDER: this.provider,
          USER_EMAIL: options?.userEmail || "",
          CLIENT_ID: effectiveClientId || "default",
          GOOGLE_CLI_TOOL: options?.cliTool || "",
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
    for (let i = 0; i < 8; i++) {
      await this.delay(200);
      cliOAuthSessionRepository.syncAll();
      const session = cliOAuthSessionRepository.getSessionById(sessionId);
      if (session && this.isValidOAuthUrl(session.oauthUrl)) {
        return this.adaptSessionWithAppCallback(session, appCallback);
      }
      const candidateFiles = this.provider === "google"
        ? ["/tmp/antigravity_auth_url.txt", "/tmp/gemini_auth_url.txt"]
        : [`/tmp/${this.provider}_auth_url.txt`, `/tmp/${this.cliBinary}_auth_url.txt`];
      for (const f of candidateFiles) {
        if (fileUtils.exists(f)) {
          try {
            const rawUrl = fileUtils.readFileSync(f).trim();
            if (this.isValidOAuthUrl(rawUrl)) {
              return this.adaptSessionWithAppCallback(
                {
                  sessionId,
                  provider: this.provider,
                  modelId: modelId || this.defaultModelId,
                  authMode: `${this.provider} CLI OAuth Daemon`,
                  oauthUrl: rawUrl,
                  status: "PENDING",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                appCallback,
              );
            }
          } catch {
            // continue
          }
        }
      }
      const latest = this.getLatestSession(modelId);
      if (latest && latest.sessionId === sessionId && this.isValidOAuthUrl(latest.oauthUrl)) {
        return this.adaptSessionWithAppCallback(latest, appCallback);
      }
    }

    const fallback = this.getLatestSession(modelId);
    if (fallback && this.isValidOAuthUrl(fallback.oauthUrl)) {
      const elapsed = (Date.now() - new Date(fallback.createdAt).getTime()) / 1000;
      if (elapsed < 300 && fallback.status !== "FAILED") {
        return this.adaptSessionWithAppCallback(fallback, appCallback);
      }
    }

    // Instead of throwing a premature TIMEOUT failure while the user is signing in,
    // generate the canonical provider OAuth authorization URL with PENDING status immediately.
    const canonicalUrl = this.buildCanonicalOAuthUrl(sessionId, appCallback, modelId);
    const pendingSession: CliOAuthSession = {
      sessionId,
      provider: this.provider,
      modelId: modelId || this.defaultModelId,
      authMode: `${this.provider} CLI OAuth Daemon`,
      oauthUrl: canonicalUrl,
      status: "PENDING",
      cliRedirectUri: "http://localhost:8085/oauth2callback",
      appRedirectUri: appCallback,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    cliOAuthSessionRepository.upsertSession(pendingSession);
    return pendingSession;
  }

  protected buildCanonicalOAuthUrl(sessionId: string, appCallbackUrl: string, _modelId?: string): string {
    const encodedCallback = encodeURIComponent(appCallbackUrl);
    const encodedState = encodeURIComponent(sessionId);
    const activeClient = providerOAuthClientRepository.resolveActiveClient(this.provider, _modelId);
    if (this.provider === "google") {
      const clientId = activeClient?.clientId || GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID;
      if (clientId) {
        const scopes = encodeURIComponent((activeClient?.scopes?.join(" ") || GoogleAuthConstants.DEFAULT_SCOPES.join(" ")));
        return `https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=${clientId}&prompt=select_account%20consent&redirect_uri=${encodedCallback}&response_type=code&scope=${scopes}&state=${encodedState}`;
      }
      return `http://localhost:8085/oauth2/authorize?provider=google&modelId=${encodeURIComponent(_modelId || "gemini-3.8-flash")}&sessionId=${encodedState}`;
    }
    if (this.provider === "anthropic") {
      const clientId = activeClient?.clientId || processUtils.getEnv("ANTHROPIC_CLI_OAUTH_CLIENT_ID", "");
      return `https://console.anthropic.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodedCallback}&response_type=code&scope=claude.user%20claude.chat&state=${encodedState}`;
    }
    if (this.provider === "github") {
      const clientId = activeClient?.clientId || processUtils.getEnv("GITHUB_COPILOT_OAUTH_CLIENT_ID", "");
      return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodedCallback}&scope=read%3Auser%20copilot&state=${encodedState}`;
    }
    const clientId = activeClient?.clientId || processUtils.getEnv("OPENAI_CLI_OAUTH_CLIENT_ID", "");
    return `https://platform.openai.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodedCallback}&response_type=code&scope=model.read%20chat.completion&state=${encodedState}`;
  }

  protected isValidOAuthUrl(url?: string): boolean {
    const cleaned = AbstractCliAuthStrategy.sanitizeOAuthRedirectUrl(url);
    if (cleaned.length < 20) return false;
    if (this.provider === "google") {
      return cleaned.includes("accounts.google.com") || cleaned.includes("googleapis.com");
    }
    // For non-Google providers (e.g. OpenAI, Anthropic, GitHub), NEVER accept Google or Antigravity URLs!
    if (cleaned.includes("accounts.google.com") || cleaned.includes("antigravity.google")) {
      return false;
    }
    return true;
  }

  /**
   * Removes OSC-8 hyperlinks, ASCII control chars, concatenated second URLs,
   * and duplicate OAuth query parameters (such as repeated `scope`).
   */
  public static sanitizeOAuthRedirectUrl(rawUrl?: string): string {
    if (!rawUrl) return "";
    let cleaned = rawUrl.trim();
    cleaned = cleaned.replace(/\x1b\]8;;/g, "").replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\\/g, " ");
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
    const httpsIdx = cleaned.indexOf("https://");
    const httpIdx = cleaned.indexOf("http://");
    const startIdx = httpsIdx >= 0 && httpIdx >= 0 ? Math.min(httpsIdx, httpIdx) : httpsIdx >= 0 ? httpsIdx : httpIdx;
    if (startIdx >= 0) {
      cleaned = cleaned.slice(startIdx);
    }
    const spaceIdx = cleaned.indexOf(" ");
    if (spaceIdx > 0) {
      cleaned = cleaned.slice(0, spaceIdx);
    }
    const waitingIdx = cleaned.indexOf("Waiting");
    if (waitingIdx > 0) {
      cleaned = cleaned.slice(0, waitingIdx);
    }
    const secondHttpsIdx = cleaned.indexOf("https://", 8);
    if (secondHttpsIdx > 0) cleaned = cleaned.slice(0, secondHttpsIdx).trim();
    const secondHttpIdx = cleaned.indexOf("http://", 7);
    if (secondHttpIdx > 0) cleaned = cleaned.slice(0, secondHttpIdx).trim();
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) return "";
    try {
      const parsed = new URL(cleaned);
      const uniqueParams = new URLSearchParams();
      parsed.searchParams.forEach((val, key) => {
        let cleanVal = val;
        if (cleanVal.endsWith("Waiting")) {
          cleanVal = cleanVal.replace(/Waiting.*$/i, "");
        }
        if (!uniqueParams.has(key)) uniqueParams.set(key, cleanVal);
      });
      if (parsed.hostname.includes("google.com")) {
        if (!uniqueParams.has("response_type")) {
          uniqueParams.set("response_type", "code");
        }
        const existingClientId = uniqueParams.get("client_id");
        if (!existingClientId || existingClientId === "default" || existingClientId.trim().length === 0) {
          uniqueParams.set("client_id", GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID);
        }
        const existingRedirect = uniqueParams.get("redirect_uri");
        if (!existingRedirect || existingRedirect.trim().length === 0) {
          uniqueParams.set("redirect_uri", "http://localhost:8085/oauth2callback");
        }
        const existingScope = uniqueParams.get("scope");
        if (!existingScope || existingScope.trim().length === 0) {
          uniqueParams.set("scope", GoogleAuthConstants.DEFAULT_SCOPES.join(" "));
        }
      }
      parsed.search = uniqueParams.toString();
      return parsed.toString();
    } catch {
      return cleaned;
    }
  }

  private adaptSessionWithAppCallback(
    session: CliOAuthSession,
    appCallbackUrl: string,
  ): CliOAuthSession {
    const sanitizedUrl = AbstractCliAuthStrategy.sanitizeOAuthRedirectUrl(session.oauthUrl);
    if (!sanitizedUrl) return session;

    try {
      const parsed = new URL(sanitizedUrl);
      const originalCliRedirect = parsed.searchParams.get("redirect_uri") || session.cliRedirectUri || "";
      const cleanState = parsed.searchParams.get("state") || session.state;

      const adapted: CliOAuthSession = {
        ...session,
        oauthUrl: sanitizedUrl,
        state: cleanState,
        cliRedirectUri: originalCliRedirect,
        appRedirectUri: appCallbackUrl,
      };
      cliOAuthSessionRepository.upsertSession(adapted);
      return adapted;
    } catch {
      return { ...session, oauthUrl: sanitizedUrl };
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
    const session =
      cliOAuthSessionRepository.getLatestPendingSession(targetModel) ||
      cliOAuthSessionRepository.getLatestSession(targetModel);
    if (session && session.oauthUrl && !this.isValidOAuthUrl(session.oauthUrl)) {
      return null;
    }
    return session;
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
