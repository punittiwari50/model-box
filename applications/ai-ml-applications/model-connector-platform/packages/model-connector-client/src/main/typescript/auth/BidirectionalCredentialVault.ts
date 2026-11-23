import {
  fileUtils,
  pathUtils,
  processUtils,
  ProviderId,
  GoogleAuthConstants,
} from "@model-box/model-connector-core";
import { accountRepository, type ModelAccount } from "@/auth/ModelAccountRepository.js";

export interface BidirectionalAuthOutcome {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userEmail: string;
  readonly authorizedTimestamp: string;
  readonly expiresInSeconds?: number;
  readonly scopes?: readonly string[];
}

export interface BidirectionalSaveParams {
  readonly modelId: string;
  readonly provider: string;
  readonly userEmail: string;
  readonly accountCategory?: "individual" | "enterprise";
  readonly outcome: BidirectionalAuthOutcome;
  readonly authMode?: string;
  readonly rawResponse?: Record<string, unknown>;
  readonly cliProcessUsed?: string;
  readonly authCode?: string;
}

export interface BidirectionalSaveResult {
  readonly success: boolean;
  readonly account: ModelAccount;
  readonly credentialsFilePath: string;
  readonly responseFilePath: string;
  readonly volumeDirectory: string;
  readonly cliHomeFilePath?: string;
  readonly responsePayload: Record<string, unknown>;
}

export class BidirectionalCredentialVault {
  private static instance: BidirectionalCredentialVault | null = null;
  private readonly volumeBaseDir: string;

  constructor(customVolumeDir?: string) {
    this.volumeBaseDir = this.resolveVolumeBaseDirectory(customVolumeDir);
  }

  public static getInstance(): BidirectionalCredentialVault {
    if (!this.instance) {
      this.instance = new BidirectionalCredentialVault();
    }
    return this.instance;
  }

  public resolveVolumeBaseDirectory(customDir?: string): string {
    if (customDir && customDir.trim()) {
      return pathUtils.resolve(customDir.trim());
    }
    const envDataDir = processUtils.getEnv("DATA_DIR", "/app/config/data");
    if (fileUtils.exists(envDataDir)) {
      return pathUtils.resolve(envDataDir);
    }
    const cwdDataDir = pathUtils.resolve(process.cwd(), "config/data");
    if (fileUtils.exists(cwdDataDir)) {
      return cwdDataDir;
    }
    return pathUtils.resolve(envDataDir);
  }

  public getVolumeBaseDirectory(): string {
    return this.volumeBaseDir;
  }

  public getCredentialsDirectory(): string {
    const dir = pathUtils.join(this.volumeBaseDir, "credentials");
    fileUtils.ensureDirectory(dir);
    return dir;
  }

  public getOAuthResponsesDirectory(): string {
    const dir = pathUtils.join(this.volumeBaseDir, "oauth_responses");
    fileUtils.ensureDirectory(dir);
    return dir;
  }

  public saveOAuthResponseAndCredentials(
    params: BidirectionalSaveParams,
  ): BidirectionalSaveResult {
    const credDir = this.getCredentialsDirectory();
    const respDir = this.getOAuthResponsesDirectory();
    const providerKey = params.provider.toLowerCase();
    const credPath = pathUtils.join(credDir, `${providerKey}_oauth_creds.json`);
    const respPath = pathUtils.join(respDir, `${providerKey}_auth_response.json`);

    const accessToken = params.outcome?.accessToken || "";
    if (!accessToken || accessToken.startsWith("4/") || accessToken.includes("authcode_")) {
      return Object.freeze({
        success: false,
        account: null as unknown as ModelAccount,
        credentialsFilePath: credPath,
        responseFilePath: respPath,
        volumeDirectory: this.volumeBaseDir,
        responsePayload: Object.freeze({ error: "Missing or unexchanged authorization code" }),
      });
    }

    const credContent = this.formatCredentialsContent(params);
    fileUtils.writeFileSync(credPath, credContent);

    if (providerKey === ProviderId.GOOGLE) {
      const geminiCredPath = pathUtils.join(credDir, "gemini_oauth_creds.json");
      fileUtils.writeFileSync(geminiCredPath, credContent);
    }

    const responsePayload = this.buildResponsePayload(params, credPath, respPath);
    fileUtils.writeFileSync(respPath, JSON.stringify(responsePayload, null, 2));

    const cliHomePath = this.syncToCliHomeLocation(params, credContent);
    this.transmitAuthCodeToDaemons(params.authCode);
    const account = this.persistToDatabase(params, credContent, respPath);

    return Object.freeze({
      success: true,
      account,
      credentialsFilePath: credPath,
      responseFilePath: respPath,
      volumeDirectory: this.volumeBaseDir,
      cliHomeFilePath: cliHomePath,
      responsePayload,
    });
  }

  private formatCredentialsContent(params: BidirectionalSaveParams): string {
    const scopes = params.outcome.scopes || GoogleAuthConstants.DEFAULT_SCOPES;
    const expiryDate = Date.now() + (params.outcome.expiresInSeconds ?? 3600) * 1000;
    const payload = {
      type: "authorized_user",
      client_id: GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID,
      client_secret: "",
      refresh_token: params.outcome.refreshToken,
      access_token: params.outcome.accessToken,
      token_type: "Bearer",
      scope: scopes.join(" "),
      expiry_date: expiryDate,
    };
    return JSON.stringify(payload, null, 2);
  }

  private buildResponsePayload(
    params: BidirectionalSaveParams,
    credPath: string,
    respPath: string,
  ): Record<string, unknown> {
    const expiresIn = params.outcome.expiresInSeconds ?? 3600;
    const scopes = params.outcome.scopes || GoogleAuthConstants.DEFAULT_SCOPES;
    return {
      success: true,
      modelId: params.modelId,
      provider: params.provider,
      authMode: params.authMode || "Google OAuth (Antigravity CLI Option 1)",
      accountCategory: params.accountCategory || "individual",
      userEmail: params.userEmail,
      accessToken: params.outcome.accessToken,
      refreshToken: params.outcome.refreshToken,
      tokenType: "Bearer",
      expiresInSeconds: expiresIn,
      expiryDate: Date.now() + expiresIn * 1000,
      scopes,
      authorizedTimestamp: params.outcome.authorizedTimestamp,
      bidirectionalVolume: {
        volumeDirectory: this.volumeBaseDir,
        credentialsFile: credPath,
        responseFile: respPath,
      },
      cliMetadata: {
        cliCommand: params.cliProcessUsed || "agy",
        loginOption: "1. Google OAuth",
        installedVersion: "1.4.12",
      },
      ...(params.rawResponse ? { rawResponse: params.rawResponse } : {}),
    };
  }

  private persistToDatabase(
    params: BidirectionalSaveParams,
    credentialsFileContent: string,
    responseFilePath: string,
  ): ModelAccount {
    const isGoogle = params.provider === ProviderId.GOOGLE;
    const providerLabel = isGoogle ? "Google Cloud / Gemini CLI" : params.provider.toUpperCase();
    const cleanEmail =
      params.userEmail && !params.userEmail.includes("<") && !params.userEmail.includes("user-email")
        ? params.userEmail.trim()
        : "";
    const accountName = cleanEmail ? `${providerLabel} (${cleanEmail})` : providerLabel;
    const scopes = params.outcome.scopes || GoogleAuthConstants.DEFAULT_SCOPES;
    const authCode = params.authCode || (params.rawResponse?.code as string) || "";
    const configJson = JSON.stringify({
      provider: params.provider,
      accountCategory: params.accountCategory || "individual",
      authMode: params.authMode || "1. Google OAuth",
      oauthScopes: scopes,
      refreshToken: params.outcome.refreshToken,
      authorizedTimestamp: params.outcome.authorizedTimestamp,
      credentialsFileContent,
      responseFilePath,
      volumeDirectory: this.volumeBaseDir,
      authCode,
    });
    const match = accountRepository.findMatchingAccount(params.modelId, accountName, params.userEmail);
    if (match) {
      const updated = accountRepository.updateAccount(match.accountId, {
        accountName,
        userEmail: params.userEmail,
        authType: "cli_oauth",
        credentialValue: params.outcome.accessToken,
        isActive: false, // Invariant: Must not be active stage until connection is verified with 2xx response
        authCode,
        configJson,
      });
      if (updated) return updated;
    }
    return accountRepository.createAccount({
      modelId: params.modelId,
      accountName,
      userEmail: params.userEmail,
      authType: "cli_oauth",
      credentialValue: params.outcome.accessToken,
      isActive: false, // Invariant: Must not be active stage until connection is verified with 2xx response
      authCode,
      configJson,
    });
  }

  private syncToCliHomeLocation(
    params: BidirectionalSaveParams,
    fileContent: string,
  ): string | undefined {
    if (params.provider !== ProviderId.GOOGLE) return undefined;
    const homeDir = processUtils.getEnv("HOME", "") || processUtils.getEnv("USERPROFILE", "");
    const targets = [
      homeDir ? pathUtils.join(homeDir, ".gemini", "oauth_creds.json") : "",
      homeDir ? pathUtils.join(homeDir, ".config", "antigravity", "credentials.json") : "",
      "/root/.gemini/oauth_creds.json",
      "/root/.config/gcloud/application_default_credentials.json",
      "/root/.config/antigravity/credentials.json",
      "/root/.gemini/antigravity-cli/credentials.json",
      "/home/node/.gemini/oauth_creds.json",
      "/home/node/.config/gcloud/application_default_credentials.json",
      "/home/node/.config/antigravity/credentials.json",
      "/home/node/.gemini/antigravity-cli/credentials.json",
      "/app/config/data/credentials/antigravity_oauth_creds.json",
    ].filter(Boolean);
    let primaryFile: string | undefined;
    for (const target of targets) {
      try {
        fileUtils.ensureDirectory(pathUtils.dirname(target));
        fileUtils.writeFileSync(target, fileContent);
        if (!primaryFile) primaryFile = target;
      } catch {
        // Proceed across permissible locations
      }
    }
    return primaryFile;
  }

  private transmitAuthCodeToDaemons(authCode?: string): void {
    if (!authCode || !authCode.trim()) return;
    const cleanCode = authCode.trim();
    const destinations = [
      "/tmp/antigravity_auth_code.txt",
      "/tmp/gemini_auth_code.txt",
      "/tmp/google_auth_code.txt",
    ];
    for (const dest of destinations) {
      try {
        fileUtils.writeFileSync(dest, cleanCode);
      } catch {
        // best-effort
      }
    }
  }

  public readCredentialsFromVolume(provider: string): Record<string, unknown> | null {
    const credDir = this.getCredentialsDirectory();
    const filePath = pathUtils.join(credDir, `${provider.toLowerCase()}_oauth_creds.json`);
    if (!fileUtils.exists(filePath)) return null;
    try {
      return JSON.parse(fileUtils.readFileSync(filePath));
    } catch {
      return null;
    }
  }

  public readResponseFromVolume(provider: string): Record<string, unknown> | null {
    const respDir = this.getOAuthResponsesDirectory();
    const filePath = pathUtils.join(respDir, `${provider.toLowerCase()}_auth_response.json`);
    if (!fileUtils.exists(filePath)) return null;
    try {
      return JSON.parse(fileUtils.readFileSync(filePath));
    } catch {
      return null;
    }
  }
}

export const bidirectionalCredentialVault = BidirectionalCredentialVault.getInstance();
