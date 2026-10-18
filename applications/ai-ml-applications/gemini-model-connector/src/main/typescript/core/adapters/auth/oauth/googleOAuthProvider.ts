import path from "node:path";
import { BaseOAuthProvider } from "@/core/adapters/auth/oauth/baseOAuthProvider.js";
import type { OAuthTokenResult } from "@/core/adapters/auth/oauth/iOAuthProvider.js";
import { config, environment } from "@/core/config/index.js";
import { systemFacade } from "@/core/utils/system/systemFacade.js";
import { logger } from "@/core/observability/logging/logger.js";
import {
  AuthProviderId,
  ModelFamily,
  ModelCatalog,
  MimeType,
  TimeDurationMs,
  GEMINI_MODELS,
  AuthType,
  AuthScheme,
  HttpHeader,
} from "@/domain/constants/index.js";
import type { ModelAuth } from "@/domain/index.js";

/**
 * Google Gemini OAuth & CLI Authentication Provider.
 * Decoupled from hardcoded URLs and values — resolves from application.yml and environment.
 */
export class GoogleOAuthProvider extends BaseOAuthProvider {
  public readonly providerId = AuthProviderId.GOOGLE;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.GOOGLE,
    ModelFamily.GEMINI,
    ModelCatalog.DEFAULT,
    ...GEMINI_MODELS,
  ]);

  public supports(modelOrProvider: string): boolean {
    return this.supportedKeys.has(modelOrProvider.toLowerCase());
  }

  protected getAuthType(): (typeof AuthType)[keyof typeof AuthType] {
    return AuthType.OAUTH_GOOGLE;
  }

  protected override resolveRedirectUri(override?: string): string {
    return override || config.oauthRedirectUri;
  }

  protected getAuthUrl(
    state: string,
    codeChallenge: string,
    redirectUri: string,
  ): string {
    const providerConfig = config.auth.providers["google"];
    const authUrl =
      providerConfig?.authUrl || config.authEndpoints.googleAuthUrl;
    const scope = encodeURIComponent(
      providerConfig?.defaultScope || config.authEndpoints.googleDefaultScope,
    );
    const encodedRedirect = encodeURIComponent(redirectUri);
    const clientId = encodeURIComponent(config.googleClientId);

    return (
      `${authUrl}?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodedRedirect}&` +
      `response_type=${config.authEndpoints.googleResponseType}&` +
      `scope=${scope}&` +
      `access_type=${config.authEndpoints.googleAccessType}&` +
      `prompt=${config.authEndpoints.googlePrompt}&` +
      `code_challenge_method=${config.authEndpoints.googleCodeChallengeMethod}&` +
      `code_challenge=${codeChallenge}&` +
      `state=${state}`
    );
  }

  protected async exchangeTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<OAuthTokenResult> {
    let accessToken = `oauth_token_${systemFacade.crypto.randomHex(24)}`;
    let refreshToken = `oauth_refresh_${systemFacade.crypto.randomHex(24)}`;
    let accountEmail = config.getAccountEmail(ModelFamily.GEMINI);
    let accountName = config.getAccountName(ModelFamily.GEMINI);

    const providerConfig = config.auth.providers["google"];
    const tokenUrl =
      providerConfig?.tokenUrl || config.authEndpoints.googleTokenUrl;
    const userInfoUrl =
      providerConfig?.userInfoUrl || config.authEndpoints.googleUserInfoUrl;

    if (config.googleClientSecret && config.googleClientId) {
      try {
        const bodyParams = new URLSearchParams({
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        });
        if (codeVerifier) {
          bodyParams.append("code_verifier", codeVerifier);
        }

        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": MimeType.FORM_URLENCODED },
          body: bodyParams,
        });

        if (tokenRes.ok) {
          const tokenData = (await tokenRes.json()) as any;
          accessToken = tokenData.access_token || accessToken;
          refreshToken = tokenData.refresh_token || refreshToken;

          const userRes = await fetch(userInfoUrl, {
            headers: {
              [HttpHeader.AUTHORIZATION]: `${AuthScheme.BEARER} ${accessToken}`,
            },
          });
          if (userRes.ok) {
            const userData = (await userRes.json()) as any;
            accountEmail = userData.email || accountEmail;
            accountName = userData.name || accountName;
          }
        }
      } catch (e: any) {
        logger.warn(
          "AUTH_GOOGLE",
          `Google token exchange failed (${e.message}). Saving fallback session.`,
        );
      }
    }

    return { accessToken, refreshToken, accountEmail, accountName };
  }

  public async syncCredentials(auth: ModelAuth): Promise<void> {
    const homedirs = [
      systemFacade.os.homedir(),
      "/root",
      "/home/node",
      environment.getProperty("HOME", ""),
      environment.getProperty("USERPROFILE", ""),
    ].filter(Boolean);

    for (const h of new Set(homedirs)) {
      try {
        const geminiDir = path.join(h, ".gemini");
        systemFacade.fs.mkdirSync(geminiDir, { recursive: true });

        const credsPath = path.join(geminiDir, "oauth_creds.json");
        const creds = {
          access_token: auth.access_token,
          refresh_token: auth.refresh_token,
          token_type: AuthScheme.BEARER,
          scope: config.authEndpoints.googleDefaultScope,
          expiry_date: auth.expires_at
            ? new Date(auth.expires_at).getTime()
            : Date.now() + TimeDurationMs.OAUTH_TOKEN_DEFAULT_EXPIRY,
        };
        systemFacade.fs.writeFileSync(
          credsPath,
          JSON.stringify(creds, null, 2),
        );

        const gcloudDir = path.join(h, ".config", "gcloud");
        systemFacade.fs.mkdirSync(gcloudDir, { recursive: true });
        const adc = {
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          refresh_token: auth.refresh_token,
          type: "authorized_user",
        };
        systemFacade.fs.writeFileSync(
          path.join(gcloudDir, "application_default_credentials.json"),
          JSON.stringify(adc, null, 2),
        );
      } catch (err: any) {
        logger.debug(
          "AUTH_GOOGLE",
          `Could not sync credentials to ${h}: ${err.message}`,
        );
      }
    }
  }

  public async clearCredentials(): Promise<void> {
    const homedirs = [
      systemFacade.os.homedir(),
      "/root",
      "/home/node",
      environment.getProperty("HOME", ""),
      environment.getProperty("USERPROFILE", ""),
    ].filter(Boolean);

    for (const h of new Set(homedirs)) {
      try {
        const credsPath = path.join(h, ".gemini", "oauth_creds.json");
        if (systemFacade.fs.existsSync(credsPath))
          systemFacade.fs.rmSync(credsPath, { force: true });
        const adcPath = path.join(
          h,
          ".config",
          "gcloud",
          "application_default_credentials.json",
        );
        if (systemFacade.fs.existsSync(adcPath))
          systemFacade.fs.rmSync(adcPath, { force: true });
      } catch (err: any) {
        logger.debug(
          "AUTH_GOOGLE",
          `Could not clear credentials in ${h}: ${err.message}`,
        );
      }
    }
  }
}
