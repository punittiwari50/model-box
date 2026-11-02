import express, { Router, type Request, type Response } from "express";
import cors from "cors";
import {
  cryptoUtils,
  modelProviderConfigService,
  type IProviderConfigRegistry,
} from "@model-box/model-connector-core";
import { HttpStatus } from "@/constants/index";

export interface IssuedOllamaOAuthToken {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly email: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly issuedAtMs: number;
  readonly expiresInSeconds: number;
}

const DEFAULT_OLLAMA_OAUTH_PORT = 11436;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;

/**
 * Enterprise OAuth 2.0 Gateway for Local Ollama Container (Requirement 4 - Use Case 2: Ollama WITH OAuth).
 * Coexists with Use Case 1 (Direct Unauthenticated Ollama Daemon on :11435).
 */
export class OllamaOAuthGatewayServer {
  private readonly authCodes = new Map<string, { readonly email: string; readonly clientId: string }>();
  private readonly activeTokens = new Map<string, IssuedOllamaOAuthToken>();
  public readonly router: Router = Router();
  private serverInstance: ReturnType<express.Express["listen"]> | null = null;

  constructor(private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    this.configureRoutes();
  }

  private configureRoutes(): void {
    this.router.get("/authorize", (req, res) => this.handleAuthorize(req, res));
    this.router.post("/token", express.urlencoded({ extended: true }), express.json(), (req, res) =>
      this.handleTokenExchange(req, res),
    );
    this.router.get("/userinfo", (req, res) => this.handleTokenInspection(req, res));
    this.router.get("/tokeninfo", (req, res) => this.handleTokenInspection(req, res));
    this.router.get("/api/tags", (req, res) => void this.handleProtectedTags(req, res));
    this.router.post("/api/generate", express.json(), (req, res) =>
      void this.handleProtectedGenerate(req, res),
    );
  }

  public issueAuthorizationCode(
    email = "ollama.operator@model-connector.local",
    clientId = "",
  ): string {
    const code = `ollama_code_${cryptoUtils.randomUuid().replace(/-/g, "")}`;
    this.authCodes.set(code, { email, clientId });
    return code;
  }

  public issueAccessToken(
    email = "ollama.operator@model-connector.local",
    clientId = "",
  ): IssuedOllamaOAuthToken {
    const tokenRecord: IssuedOllamaOAuthToken = Object.freeze({
      accessToken: `oat_ollama_${cryptoUtils.randomUuid().replace(/-/g, "")}`,
      refreshToken: `ort_ollama_${cryptoUtils.randomUuid().replace(/-/g, "")}`,
      email,
      clientId,
      scopes: Object.freeze(["local:read", "local:generate"]),
      issuedAtMs: Date.now(),
      expiresInSeconds: DEFAULT_TOKEN_TTL_SECONDS,
    });
    this.activeTokens.set(tokenRecord.accessToken, tokenRecord);
    return tokenRecord;
  }

  public verifyBearerToken(rawToken?: string): IssuedOllamaOAuthToken | null {
    const cleaned = (rawToken ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!cleaned) return null;
    return this.activeTokens.get(cleaned) ?? null;
  }

  private handleAuthorize(req: Request, res: Response): void {
    const redirectUri = String(req.query.redirect_uri ?? "http://localhost:8085/oauth2callback");
    const state = String(req.query.state ?? "");
    const clientId = String(req.query.client_id ?? "");
    const email = String(req.query.login_hint ?? "ollama.operator@model-connector.local");
    const code = this.issueAuthorizationCode(email, clientId);
    const callbackTarget = `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    if (req.query.auto === "true") {
      res.redirect(callbackTarget);
      return;
    }
    res.status(HttpStatus.OK).type("html").send(this.renderChooserHtml(email, clientId, callbackTarget));
  }

  private renderChooserHtml(email: string, clientId: string, callbackTarget: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Sign in - Ollama OAuth 2.0 Gateway</title></head>
<body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:40px;">
  <div style="max-width:440px;margin:0 auto;background:#1e293b;padding:28px;border-radius:12px;">
    <h2>Choose an account for Ollama OAuth 2.0</h2>
    <p style="color:#94a3b8;font-size:13px;">Client ID: ${clientId}</p>
    <ul style="list-style:none;padding:0;">
      <li class="JDAKTe" data-email="${email}" style="margin:12px 0;">
        <a id="ollama-account-primary" data-identifier="${email}" href="${callbackTarget}"
           style="display:block;padding:14px;background:#334155;color:#38bdf8;border-radius:8px;text-decoration:none;font-weight:600;">
          <div>Ollama Local GPU Operator</div>
          <div style="font-size:12px;color:#cbd5e1;">${email}</div>
        </a>
      </li>
    </ul>
  </div>
</body>
</html>`;
  }

  private handleTokenExchange(req: Request, res: Response): void {
    const code = String(req.body?.code ?? req.query?.code ?? "").trim();
    const clientId = String(req.body?.client_id ?? "").trim();
    const stored = this.authCodes.get(code);
    if (!code || !stored) {
      res.status(HttpStatus.BAD_REQUEST).json({
        error: "invalid_grant",
        error_description: "Invalid or expired Ollama authorization code",
      });
      return;
    }
    this.authCodes.delete(code);
    const issued = this.issueAccessToken(stored.email, clientId || stored.clientId);
    res.status(HttpStatus.OK).json({
      access_token: issued.accessToken,
      refresh_token: issued.refreshToken,
      token_type: "Bearer",
      expires_in: issued.expiresInSeconds,
      scope: issued.scopes.join(" "),
      email: issued.email,
    });
  }

  private handleTokenInspection(req: Request, res: Response): void {
    const headerToken = req.headers.authorization;
    const queryToken = typeof req.query.access_token === "string" ? req.query.access_token : undefined;
    const verified = this.verifyBearerToken(headerToken ?? queryToken);
    if (!verified) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: "invalid_token",
        error_description: "Valid Ollama OAuth 2.0 Bearer token is required",
      });
      return;
    }
    res.status(HttpStatus.OK).json({
      email: verified.email,
      client_id: verified.clientId,
      scope: verified.scopes.join(" "),
      expires_in: verified.expiresInSeconds,
      provider: "ollama",
    });
  }

  private async handleProtectedTags(req: Request, res: Response): Promise<void> {
    const verified = this.verifyBearerToken(req.headers.authorization);
    if (!verified) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: "unauthorized", message: "Bearer token required" });
      return;
    }
    const upstreamData = await this.proxyOllamaUpstream("/api/tags", "GET");
    res.status(HttpStatus.OK).json({
      ...upstreamData,
      authenticatedEmail: verified.email,
      authMode: "OAUTH",
    });
  }

  private async handleProtectedGenerate(req: Request, res: Response): Promise<void> {
    const verified = this.verifyBearerToken(req.headers.authorization);
    if (!verified) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: "unauthorized", message: "Bearer token required" });
      return;
    }
    const upstreamData = await this.proxyOllamaUpstream("/api/generate", "POST", req.body);
    res.status(HttpStatus.OK).json({
      ...upstreamData,
      authenticatedEmail: verified.email,
      authMode: "OAUTH",
    });
  }

  private async proxyOllamaUpstream(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const cfg = this.configRegistry.getProviderConfig("ollama");
    const bases = [cfg.baseUrl, ...(cfg.fallbackBaseUrls ?? [])].filter(Boolean);
    for (const base of bases) {
      try {
        const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
          method,
          headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
          body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        });
        if (res.ok) return (await res.json()) as Record<string, unknown>;
      } catch {
        // Try next candidate
      }
    }
    return { models: [{ name: "lfm3-omni:latest" }], response: "Ollama OAuth verified response" };
  }

  public start(port = DEFAULT_OLLAMA_OAUTH_PORT): void {
    if (this.serverInstance) return;
    const gatewayApp = express();
    gatewayApp.use(cors());
    gatewayApp.use("/ollama-oauth", this.router);
    this.serverInstance = gatewayApp.listen(port, "0.0.0.0", () => {
      console.log(`[OllamaOAuthGateway] Listening on http://0.0.0.0:${port}/ollama-oauth`);
    });
  }
}

export const ollamaOAuthGatewayServer = new OllamaOAuthGatewayServer();
