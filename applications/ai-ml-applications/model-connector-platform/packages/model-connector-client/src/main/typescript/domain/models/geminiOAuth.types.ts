/**
 * Domain Models for Gemini CLI Google OAuth Authentication & Custom Location Management.
 * Conforms to:
 * - STD-COD-005: Clean Domain Modeling & Distributed Multi-User Lineage
 * - STD-COD-007.5: Immutability by Default
 */

export interface GeminiOAuthCredentialFile {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly scope?: string;
  readonly token_type?: string;
  readonly expiry_date?: number;
  readonly id_token?: string;
  readonly type?: string;
  readonly client_id?: string;
  readonly client_secret?: string;
}

export interface GeminiUserSessionAuthContext {
  readonly userId: string;
  readonly accountId: string;
  readonly userEmail: string;
  readonly customLocation?: string;
  readonly credentialsFileName: string;
  readonly credentialsFileContent: string;
  readonly tokens?: GeminiOAuthCredentialFile;
  readonly isDefault?: boolean;
  readonly lastSyncedAt?: string;
}

export interface ResolvedGeminiAuthLocation {
  readonly baseDir: string;
  readonly filePath: string;
  readonly isCustom: boolean;
}

