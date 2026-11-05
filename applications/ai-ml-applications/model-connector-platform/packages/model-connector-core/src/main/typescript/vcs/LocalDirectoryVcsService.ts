/**
 * Local Directory Version Control Service.
 * Provides isolated in-container Git & Snapshot version control.
 * Conforms to:
 * - STD-COD-001 (@/* imports)
 * - STD-COD-005 (OOP, Dependency Injection, SOLID)
 * - STD-COD-007 (Functions <= 20 lines, SLAP)
 */

import { fileUtils, type IFileUtils } from "@/utils/file/fileUtils.js";
import { logger, type ILogger } from "@/logging/logger.js";
import { CompositeVcsEngine } from "@/vcs/VcsEngineStrategies.js";
import type {
  ILocalDirectoryVcsService,
  IVcsEngine,
  VcsSnapshot,
  VcsDiffReport,
  VcsStatusReport,
} from "@/vcs/vcs.types.js";

export class LocalDirectoryVcsService implements ILocalDirectoryVcsService {
  constructor(
    private readonly vcsEngine: IVcsEngine = new CompositeVcsEngine(),
    private readonly files: IFileUtils = fileUtils,
    private readonly log: ILogger = logger,
  ) {}

  public async initializeDirectory(dirPath: string): Promise<boolean> {
    this.files.ensureDirectory(dirPath);
    const initialized = await this.vcsEngine.initialize(dirPath);
    this.log.info(`[LocalDirectoryVcsService] Initialized VCS in ${dirPath} (success: ${initialized})`);
    return initialized;
  }

  public async captureSnapshot(dirPath: string, label: string): Promise<VcsSnapshot> {
    this.files.ensureDirectory(dirPath);
    const snapshotId = `snap-${label}-${Date.now()}`;
    return this.vcsEngine.captureSnapshot(dirPath, snapshotId);
  }

  public async detectDiffAndCommit(
    baseSnapshot: VcsSnapshot,
    commitMessage: string,
  ): Promise<VcsDiffReport> {
    const dirPath = baseSnapshot.directoryPath;
    const changedFiles = await this.vcsEngine.computeDiff(baseSnapshot, dirPath);
    const hasChanges = changedFiles.length > 0;
    const commitHash = hasChanges
      ? await this.vcsEngine.commitChanges(dirPath, commitMessage)
      : baseSnapshot.gitCommitHash;

    return {
      snapshotId: `diff-${Date.now()}`,
      baseSnapshotId: baseSnapshot.snapshotId,
      timestamp: new Date().toISOString(),
      hasChanges,
      changedFiles,
      gitCommitHash: commitHash,
    };
  }

  public async getStatus(dirPath: string): Promise<VcsStatusReport> {
    const exists = this.files.exists(dirPath);
    const gitDirExists = this.files.exists(`${dirPath}/.git`);
    const snapshot = exists
      ? await this.vcsEngine.captureSnapshot(dirPath, "status")
      : { files: new Map() };

    const recentChangedFiles = Array.from(snapshot.files.keys()).slice(0, 10);
    return {
      directoryPath: dirPath,
      exists,
      isGitRepo: gitDirExists,
      currentCommitHash: (snapshot as VcsSnapshot).gitCommitHash,
      totalTrackedFiles: snapshot.files.size,
      recentChangedFiles,
    };
  }
}

export const localDirectoryVcsService = new LocalDirectoryVcsService();

