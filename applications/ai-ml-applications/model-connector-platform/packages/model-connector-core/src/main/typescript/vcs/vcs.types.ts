/**
 * Local Directory Version Control & Multi-Account Credential Synchronization Types.
 * Conforms to:
 * - STD-COD-001 (@/* imports)
 * - STD-COD-005 (OOP, DI, Strategy Pattern)
 * - STD-COD-007 (Clean Code, strongly typed immutable contracts)
 */

export type VcsChangeType = "CREATED" | "MODIFIED" | "DELETED";

export interface VcsFileRecord {
  readonly relativePath: string;
  readonly fullPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly modifiedTime: string;
}

export interface VcsSnapshot {
  readonly snapshotId: string;
  readonly directoryPath: string;
  readonly timestamp: string;
  readonly files: ReadonlyMap<string, VcsFileRecord>;
  readonly gitCommitHash?: string;
}

export interface VcsChangedFile {
  readonly relativePath: string;
  readonly fullPath: string;
  readonly changeType: VcsChangeType;
  readonly previousSha256?: string;
  readonly currentSha256?: string;
  readonly content?: string;
}

export interface VcsDiffReport {
  readonly snapshotId: string;
  readonly baseSnapshotId: string;
  readonly timestamp: string;
  readonly hasChanges: boolean;
  readonly changedFiles: readonly VcsChangedFile[];
  readonly gitCommitHash?: string;
}

export interface ExtractedAccountCredential {
  readonly userEmail: string;
  readonly accountName: string;
  readonly authType: string;
  readonly credentialValue: string;
  readonly configJson: string;
  readonly rawData: Readonly<Record<string, unknown>>;
  readonly modelId: string;
}

export interface SyncedAccountReport {
  readonly accountId: string;
  readonly modelId: string;
  readonly userEmail: string;
  readonly accountName: string;
  readonly authType: string;
  readonly sourceFile: string;
  readonly isNewAccount: boolean;
  readonly synchronizedAt: string;
}

export interface VcsTrackingResult<T> {
  readonly result: T;
  readonly diffReport: VcsDiffReport;
  readonly syncedAccounts: readonly SyncedAccountReport[];
}

export interface VcsStatusReport {
  readonly directoryPath: string;
  readonly exists: boolean;
  readonly isGitRepo: boolean;
  readonly currentCommitHash?: string;
  readonly totalTrackedFiles: number;
  readonly recentChangedFiles: readonly string[];
}

export interface IVcsEngine {
  readonly name: string;
  initialize(dirPath: string): Promise<boolean>;
  captureSnapshot(dirPath: string, snapshotId: string): Promise<VcsSnapshot>;
  computeDiff(baseSnapshot: VcsSnapshot, currentDir: string): Promise<readonly VcsChangedFile[]>;
  commitChanges(dirPath: string, message: string): Promise<string | undefined>;
}

export interface ICredentialExtractorStrategy {
  readonly provider: string;
  supports(filePath: string, content: string): boolean;
  extract(filePath: string, content: string, defaultModelId: string): ExtractedAccountCredential | undefined;
}

export interface ILocalDirectoryVcsService {
  initializeDirectory(dirPath: string): Promise<boolean>;
  captureSnapshot(dirPath: string, label: string): Promise<VcsSnapshot>;
  detectDiffAndCommit(baseSnapshot: VcsSnapshot, commitMessage: string): Promise<VcsDiffReport>;
  getStatus(dirPath: string): Promise<VcsStatusReport>;
}

export interface IDirectoryAccountSyncService {
  executeWithVcsTracking<T>(
    modelId: string,
    actionName: string,
    action: () => Promise<T>,
    dirPath?: string,
    preferredEmail?: string,
  ): Promise<VcsTrackingResult<T>>;
  syncChangedFilesToDatabase(
    diffReport: VcsDiffReport,
    modelId: string,
    preferredEmail?: string,
  ): Promise<readonly SyncedAccountReport[]>;
  getVcsStatus(dirPath?: string): Promise<VcsStatusReport>;
}

