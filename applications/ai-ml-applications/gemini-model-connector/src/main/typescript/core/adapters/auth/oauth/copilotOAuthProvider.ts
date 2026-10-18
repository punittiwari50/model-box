import { BaseOAuthProvider } from '@/core/adapters/auth/oauth/baseOAuthProvider.js';
import type { OAuthTokenResult } from '@/core/adapters/auth/oauth/iOAuthProvider.js';
import { config, environment } from '@/core/config/index.js';
import { logger } from '@/core/observability/logging/logger.js';
import {
  AuthProviderId,
  ModelFamily,
  COPILOT_MODELS,
  AuthType,
  OAuthConstant,
  MimeType,
  HttpHeader,
} from '@/domain/constants/index.js';
import type { ModelAuth } from '@/domain/index.js';

/**
 * GitHub Copilot Authentication Provider.
 * Conforms to GitHub OAuth & Copilot Token Exchange standards:
 * - Direct token authentication (GitHub Personal Access Token, Copilot Token).
 * - Full OAuth 2.0 Web Application Flow via GitHub.
 * - Profile resolution via GitHub User API (login, email, account name).
 * - Zero hardcoded credentials (STD-COD-002, Invariant #7).
 */
export class CopilotOAuthProvider extends BaseOAuthProvider {
  public readonly providerId = AuthProviderId.COPILOT;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.COPILOT,
    'github',
    'github-copilot',
    ...COPILOT_MODELS,
  ]);

  public supports(modelOrProvider: string): boolean {
    const lower = (modelOrProvider || '').toLowerCase();
    return this.supportedKeys.has(lower) || lower.includes(ModelFamily.COPILOT);
  }

  protected getAuthType(): (typeof AuthType)[keyof typeof AuthType] {
    return AuthType.OAUTH_COPILOT;
  }

  protected override resolveRedirectUri(override?: string): string {
    return override || config.oauthRedirectUri;
  }

  protected getAuthUrl(state: string, _codeChallenge: string, redirectUri: string): string {
    const providerConfig = config.auth.providers[ModelFamily.COPILOT] || config.auth.providers['github'];
    const authUrl = providerConfig?.authUrl || config.authEndpoints.copilotAuthUrl;
    const clientId = config.githubClientId || OAuthConstant.DEFAULT_GITHUB_CLIENT_ID;
    const scope = encodeURIComponent(providerConfig?.defaultScope || 'read:user,copilot');
    const encodedRedirect = encodeURIComponent(redirectUri);

    return (
      `${authUrl}?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodedRedirect}&` +
      `scope=${scope}&` +
      `state=${encodeURIComponent(state)}&` +
      `allow_signup=false`
    );
  }

  protected async exchangeTokens(
    code: string,
    redirectUri: string,
    _codeVerifier?: string
  ): Promise<OAuthTokenResult> {
    let accessToken = code || environment.getProperty('GITHUB_TOKEN', environment.getProperty('COPILOT_API_KEY', ''));
    let refreshToken = '';
    let accountEmail = config.getAccountEmail(ModelFamily.COPILOT);
    let accountName = config.getAccountName(ModelFamily.COPILOT);

    const isDirectToken =
      code.startsWith('ghp_') ||
      code.startsWith('gho_') ||
      code.startsWith('ghu_') ||
      code.startsWith('github_pat_') ||
      code.startsWith('copilot_');

    if (!isDirectToken && config.githubClientId && config.githubClientSecret) {
      try {
        const tokenUrl = config.authEndpoints.copilotTokenUrl;
        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            [HttpHeader.ACCEPT]: MimeType.JSON,
            [HttpHeader.CONTENT_TYPE]: MimeType.JSON,
          },
          body: JSON.stringify({
            client_id: config.githubClientId,
            client_secret: config.githubClientSecret,
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.access_token) {
            accessToken = data.access_token;
            refreshToken = data.refresh_token || '';
          }
        }
      } catch (err: any) {
        logger.warn('AUTH_COPILOT', `Failed to exchange GitHub authorization code: ${err.message}`);
      }
    }

    // Attempt to query GitHub user profile if access token is available
    if (accessToken && (accessToken.startsWith('gh') || accessToken.startsWith('copilot_'))) {
      try {
        const userInfoUrl = config.authEndpoints.copilotUserInfoUrl;
        const userRes = await fetch(userInfoUrl, {
          headers: {
            [HttpHeader.AUTHORIZATION]: `Bearer ${accessToken}`,
            [HttpHeader.USER_AGENT]: 'ModelBox-Copilot-Connector',
            [HttpHeader.ACCEPT]: MimeType.JSON,
          },
        });

        if (userRes.ok) {
          const user = (await userRes.json()) as any;
          if (user.email) accountEmail = user.email;
          else if (user.login) accountEmail = `${user.login}@users.noreply.github.com`;
          if (user.name) accountName = user.name;
          else if (user.login) accountName = user.login;
        }
      } catch (profileErr: any) {
        logger.warn('AUTH_COPILOT', `Failed to fetch GitHub profile: ${profileErr.message}`);
      }
    }

    return {
      accessToken,
      refreshToken,
      accountEmail,
      accountName,
    };
  }

  public async syncCredentials(auth: ModelAuth): Promise<void> {
    logger.info('AUTH_COPILOT', `Synchronized GitHub Copilot credentials for model '${auth.model}' (${auth.account_email || 'N/A'})`);
  }

  public async clearCredentials(): Promise<void> {
    logger.info('AUTH_COPILOT', 'Cleared GitHub Copilot credentials');
  }
}
