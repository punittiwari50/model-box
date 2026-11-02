import {
  fileUtils,
  pathUtils,
  processUtils,
} from "@model-box/model-connector-core";
import { GoogleAuthConstants } from "@/domain/constants/index.js";
import type {
  GeminiOAuthCredentialFile,
  ResolvedGeminiAuthLocation,
} from "@/domain/models/geminiOAuth.types.js";
import type { CliExecutionTicket } from "@/strategies/cli/CliExecutionCoordinator.js";
import type { ResolvedUserModelCredential } from "@/security/UserModelCredentialResolver.js";
import { accountRepository, type AccountRepository } from "@/auth/ModelAccountRepository.js";

export interface IGeminiCliSessionAuthManager {
  resolveCustomAuthLocation(
    ticket: CliExecutionTicket,
    credential?: ResolvedUserModelCredential,
  ): ResolvedGeminiAuthLocation;
  syncCredentialFileToLocation(location: ResolvedGeminiAuthLocation, fileContent: string): void;
  buildSessionCliEnvironment(
    location: ResolvedGeminiAuthLocation,
    tokens?: GeminiOAuthCredentialFile,
    accessToken?: string,
  ): Record<string, string>;
  syncUpdatedFileBackToDatabase(location: ResolvedGeminiAuthLocation, accountId?: string): boolean;
  formatCredentialFileContent(tokens: GeminiOAuthCredentialFile): string;
}

/**
 * Enterprise Gemini CLI Session & Custom Location Authentication Manager.
 * Orchestrates user-specific Google OAuth credential files, session-isolated directories,
 * and database synchronization for multi-account, multi-user CLI executions.
 *
 * Conforms to:
 * - STD-COD-001: Boundary-clean imports
 * - STD-COD-005: Dependency Injection & Single Responsibility
 * - STD-COD-007: SLAP <= 20 lines per function & Immutability by Default
 * - STD-COD-010: Runtime Isolation
 * - STD-COD-011: Encapsulated Core Utils (Zero direct node:* imports)
 */
export class GeminiCliSessionAuthManager implements IGeminiCliSessionAuthManager {
  private readonly defaultBaseDir: string;

  constructor(
    private readonly accountRepo: AccountRepository = accountRepository,
  ) {
    this.defaultBaseDir = processUtils.getEnv(
      GoogleAuthConstants.ENV_GEMINI_CLI_AUTH_DIR,
      GoogleAuthConstants.DEFAULT_AUTH_DIR,
    );
  }

  public resolveCustomAuthLocation(
    ticket: CliExecutionTicket,
    credential?: ResolvedUserModelCredential,
  ): ResolvedGeminiAuthLocation {
    if (credential?.customLocation && credential.customLocation.trim()) {
      const customPath = pathUtils.resolve(credential.customLocation.trim());
      return Object.freeze({
        baseDir: pathUtils.dirname(customPath),
        filePath: customPath,
        isCustom: true,
      });
    }
    const safeUser = this.sanitizePathComponent(ticket.userId || ticket.userEmail || "default-user");
    const safeAccount = this.sanitizePathComponent(ticket.accountId || credential?.accountId || "default-account");
    const baseDir = pathUtils.join(this.defaultBaseDir, "users", safeUser, safeAccount);
    const filePath = pathUtils.join(baseDir, GoogleAuthConstants.DEFAULT_GEMINI_OAUTH_FILE);
    return Object.freeze({ baseDir, filePath, isCustom: false });
  }

  public syncCredentialFileToLocation(
    location: ResolvedGeminiAuthLocation,
    fileContent: string,
  ): void {
    if (!fileContent || !fileContent.trim()) return;
    fileUtils.ensureDirectory(location.baseDir);
    fileUtils.writeFileSync(location.filePath, fileContent.trim());
  }

  public buildSessionCliEnvironment(
    location: ResolvedGeminiAuthLocation,
    tokens?: GeminiOAuthCredentialFile,
    accessToken?: string,
  ): Record<string, string> {
    const activeToken = tokens?.access_token || accessToken;
    const cleanToken = activeToken?.startsWith("Bearer ") ? activeToken.slice(7).trim() : activeToken?.trim();
    return Object.freeze({
      [GoogleAuthConstants.ENV_GOOGLE_APPLICATION_CREDENTIALS]: location.filePath,
      [GoogleAuthConstants.ENV_GEMINI_CLI_AUTH_DIR]: location.baseDir,
      [GoogleAuthConstants.ENV_HOME]: location.baseDir,
      [GoogleAuthConstants.ENV_USERPROFILE]: location.baseDir,
      ...(cleanToken ? {
        [GoogleAuthConstants.ENV_GOOGLE_GENAI_USE_GCA]: "true",
        [GoogleAuthConstants.ENV_GOOGLE_CLOUD_ACCESS_TOKEN]: cleanToken,
      } : {}),
    });
  }

  public syncUpdatedFileBackToDatabase(
    location: ResolvedGeminiAuthLocation,
    accountId?: string,
  ): boolean {
    if (!accountId || !fileUtils.exists(location.filePath)) return false;
    try {
      const rawContent = fileUtils.readFileSync(location.filePath);
      const parsed = JSON.parse(rawContent) as GeminiOAuthCredentialFile;
      const updated = this.accountRepo.saveGoogleOAuthCredentialFile({
        accountId,
        fileContent: rawContent,
        customLocation: location.isCustom ? location.filePath : undefined,
        tokens: parsed,
      });
      return Boolean(updated);
    } catch {
      return false;
    }
  }

  public formatCredentialFileContent(tokens: GeminiOAuthCredentialFile): string {
    const payload = {
      access_token: tokens.access_token || "",
      refresh_token: tokens.refresh_token || "",
      scope: tokens.scope || GoogleAuthConstants.DEFAULT_SCOPES.join(" "),
      token_type: tokens.token_type || "Bearer",
      expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
      ...(tokens.id_token ? { id_token: tokens.id_token } : {}),
      ...(tokens.client_id ? { client_id: tokens.client_id } : {}),
      ...(tokens.client_secret ? { client_secret: tokens.client_secret } : {}),
      ...(tokens.type ? { type: tokens.type } : {}),
    };
    return JSON.stringify(payload, null, 2);
  }

  private sanitizePathComponent(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  }
}

export const defaultGeminiCliSessionAuthManager: IGeminiCliSessionAuthManager =
  new GeminiCliSessionAuthManager();

