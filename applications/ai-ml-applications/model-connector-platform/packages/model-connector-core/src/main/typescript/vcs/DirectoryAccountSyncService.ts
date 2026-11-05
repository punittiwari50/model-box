/**
 * Directory Account Credential Synchronization Service.
 * Manages local version control diffing and records multi-account interactions in database.
 * Conforms to:
 * - STD-COD-001 (@/* imports)
 * - STD-COD-005 (OOP, DI, Strategy Pattern, SOLID)
 * - STD-COD-007 (Functions <= 20 lines, SLAP)
 */

import { coreDatabaseManager } from "@/database/CoreDatabaseEngine.js";
import { localDirectoryVcsService } from "@/vcs/LocalDirectoryVcsService.js";
import { credentialExtractorRegistry, CredentialExtractorRegistry } from "@/vcs/CredentialExtractorStrategies.js";
import { logger, type ILogger } from "@/logging/logger.js";
import { cryptoUtils } from "@/utils/crypto/cryptoUtils.js";
import type {
  IDirectoryAccountSyncService,
  ILocalDirectoryVcsService,
  VcsDiffReport,
  VcsTrackingResult,
  SyncedAccountReport,
  VcsStatusReport,
  VcsChangedFile,
  ExtractedAccountCredential,
} from "@/vcs/vcs.types.js";

export class DirectoryAccountSyncService implements IDirectoryAccountSyncService {
  private static readonly DEFAULT_DIR = "/app/config/data/credentials";

  constructor(
    private readonly vcsService: ILocalDirectoryVcsService = localDirectoryVcsService,
    private readonly extractorRegistry: CredentialExtractorRegistry = credentialExtractorRegistry,
    private readonly log: ILogger = logger,
  ) {}

  public async executeWithVcsTracking<T>(
    modelId: string,
    actionName: string,
    action: () => Promise<T>,
    dirPath: string = DirectoryAccountSyncService.DEFAULT_DIR,
    preferredEmail?: string,
  ): Promise<VcsTrackingResult<T>> {
    await this.vcsService.initializeDirectory(dirPath);
    const baseline = await this.vcsService.captureSnapshot(dirPath, `pre-${actionName}`);
    const result = await action();
    const commitMsg = `feat(auth): ${actionName} for model ${modelId} at ${new Date().toISOString()}`;
    const diffReport = await this.vcsService.detectDiffAndCommit(baseline, commitMsg);
    const syncedAccounts = await this.syncChangedFilesToDatabase(diffReport, modelId, preferredEmail);

    this.log.info(`[DirectoryAccountSyncService] Action ${actionName} finished. Changed files: ${diffReport.changedFiles.length}, Synced accounts: ${syncedAccounts.length}`);
    return { result, diffReport, syncedAccounts };
  }

  public async syncChangedFilesToDatabase(
    diffReport: VcsDiffReport,
    modelId: string,
    preferredEmail?: string,
  ): Promise<readonly SyncedAccountReport[]> {
    const synced: SyncedAccountReport[] = [];
    for (const change of diffReport.changedFiles) {
      if (change.changeType === "DELETED" || !change.content) continue;
      const report = this.processChangedFile(change, modelId, preferredEmail);
      if (report) synced.push(report);
    }
    return Object.freeze(synced);
  }

  private processChangedFile(
    change: VcsChangedFile,
    modelId: string,
    preferredEmail?: string,
  ): SyncedAccountReport | undefined {
    const extracted = this.extractorRegistry.extractCredential(
      change.relativePath,
      change.content || "",
      modelId,
    );
    if (!extracted) return undefined;

    const email = preferredEmail || extracted.userEmail;
    const account = { ...extracted, userEmail: email, accountName: `${extracted.accountName}` };
    return this.persistAccount(account, change.relativePath);
  }

  private persistAccount(
    extracted: ExtractedAccountCredential,
    sourceFile: string,
  ): SyncedAccountReport {
    const db = coreDatabaseManager.getDatabase();
    const existing = db
      .prepare(`SELECT ACCOUNT_ID as accountId FROM MODEL_ACCOUNTS WHERE MODEL_ID = ? AND LOWER(USER_EMAIL) = LOWER(?) LIMIT 1`)
      .get(extracted.modelId, extracted.userEmail) as { accountId?: string } | undefined;

    const isNew = !existing?.accountId;
    const accountId = existing?.accountId || `acc-${cryptoUtils.randomUuid().slice(0, 12)}`;
    const now = new Date().toISOString();

    db.prepare(`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 0 WHERE MODEL_ID = ?`).run(extracted.modelId);

    if (isNew) {
      this.insertAccount(db, accountId, extracted, now);
    } else {
      this.updateAccount(db, accountId, extracted, now);
    }

    return {
      accountId,
      modelId: extracted.modelId,
      userEmail: extracted.userEmail,
      accountName: extracted.accountName,
      authType: extracted.authType,
      sourceFile,
      isNewAccount: isNew,
      synchronizedAt: now,
    };
  }

  private insertAccount(
    db: ReturnType<typeof coreDatabaseManager.getDatabase>,
    accountId: string,
    extracted: ExtractedAccountCredential,
    now: string,
  ): void {
    db.prepare(`
      INSERT INTO MODEL_ACCOUNTS (
        ACCOUNT_ID, MODEL_ID, ACCOUNT_NAME, USER_EMAIL,
        AUTH_TYPE, CREDENTIAL_VALUE, IS_ACTIVE, CONFIG_JSON,
        CREATED_TIMESTAMP, UPDATED_TIMESTAMP
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      accountId,
      extracted.modelId,
      extracted.accountName,
      extracted.userEmail,
      extracted.authType,
      extracted.credentialValue,
      extracted.configJson,
      now,
      now,
    );
  }

  private updateAccount(
    db: ReturnType<typeof coreDatabaseManager.getDatabase>,
    accountId: string,
    extracted: ExtractedAccountCredential,
    now: string,
  ): void {
    db.prepare(`
      UPDATE MODEL_ACCOUNTS
      SET ACCOUNT_NAME = ?,
          CREDENTIAL_VALUE = ?,
          IS_ACTIVE = 1,
          CONFIG_JSON = ?,
          UPDATED_TIMESTAMP = ?
      WHERE ACCOUNT_ID = ?
    `).run(
      extracted.accountName,
      extracted.credentialValue,
      extracted.configJson,
      now,
      accountId,
    );
  }

  public async getVcsStatus(dirPath: string = DirectoryAccountSyncService.DEFAULT_DIR): Promise<VcsStatusReport> {
    return this.vcsService.getStatus(dirPath);
  }
}

export const directoryAccountSyncService = new DirectoryAccountSyncService();

