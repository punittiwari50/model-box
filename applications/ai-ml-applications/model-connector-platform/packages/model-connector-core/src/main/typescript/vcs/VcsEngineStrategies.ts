/**
 * Local Directory Version Control Engine Strategies.
 * Conforms to:
 * - STD-COD-001 (@/* imports)
 * - STD-COD-005 (Strategy & Composite Pattern, Polymorphic Dispatch)
 * - STD-COD-007 (Functions <= 20 lines, SLAP)
 * - STD-COD-011 (Core Utils Encapsulation)
 */

import { childProcessUtils } from "@/utils/process/childProcessUtils.js";
import { fileUtils } from "@/utils/file/fileUtils.js";
import { pathUtils } from "@/utils/file/pathUtils.js";
import { cryptoUtils } from "@/utils/crypto/cryptoUtils.js";
import { logger } from "@/logging/logger.js";
import type {
  IVcsEngine,
  VcsSnapshot,
  VcsFileRecord,
  VcsChangedFile,
  VcsChangeType,
} from "@/vcs/vcs.types.js";

export class HashSnapshotVcsEngine implements IVcsEngine {
  public readonly name = "HashSnapshotVcsEngine";

  public async initialize(dirPath: string): Promise<boolean> {
    fileUtils.ensureDirectory(dirPath);
    return true;
  }

  public async captureSnapshot(dirPath: string, snapshotId: string): Promise<VcsSnapshot> {
    fileUtils.ensureDirectory(dirPath);
    const files = new Map<string, VcsFileRecord>();
    this.scanDirectoryRecursively(dirPath, dirPath, files);
    return {
      snapshotId,
      directoryPath: dirPath,
      timestamp: new Date().toISOString(),
      files,
    };
  }

  private scanDirectoryRecursively(
    rootDir: string,
    currentDir: string,
    results: Map<string, VcsFileRecord>,
  ): void {
    const entries = fileUtils.exists(currentDir) ? fileUtils.readdirSync(currentDir) : [];
    for (const entry of entries) {
      if (entry.startsWith(".git")) continue;
      const fullPath = pathUtils.join(currentDir, entry);
      const relativePath = pathUtils.relative(rootDir, fullPath);
      this.processFileEntry(rootDir, fullPath, relativePath, results);
    }
  }

  private processFileEntry(
    rootDir: string,
    fullPath: string,
    relativePath: string,
    results: Map<string, VcsFileRecord>,
  ): void {
    if (fileUtils.isDirectory(fullPath)) {
      this.scanDirectoryRecursively(rootDir, fullPath, results);
      return;
    }
    const stat = fileUtils.statSync(fullPath);
    const raw = fileUtils.readFileSync(fullPath);
    const hash = cryptoUtils.sha256(raw);
    results.set(relativePath, {
      relativePath,
      fullPath,
      sha256: hash,
      sizeBytes: stat.size,
      modifiedTime: stat.mtime.toISOString(),
    });
  }

  public async computeDiff(baseSnapshot: VcsSnapshot, currentDir: string): Promise<readonly VcsChangedFile[]> {
    const currentSnapshot = await this.captureSnapshot(currentDir, `curr-${Date.now()}`);
    const changes: VcsChangedFile[] = [];

    // Detect created and modified files
    for (const [relPath, curRecord] of currentSnapshot.files.entries()) {
      const baseRecord = baseSnapshot.files.get(relPath);
      const changeType = this.resolveChangeType(baseRecord, curRecord);
      if (changeType) {
        changes.push(this.buildChangedFile(curRecord, changeType, baseRecord?.sha256));
      }
    }

    // Detect deleted files
    for (const [relPath, baseRecord] of baseSnapshot.files.entries()) {
      if (!currentSnapshot.files.has(relPath)) {
        changes.push({
          relativePath: relPath,
          fullPath: baseRecord.fullPath,
          changeType: "DELETED",
          previousSha256: baseRecord.sha256,
        });
      }
    }

    return Object.freeze(changes);
  }

  private resolveChangeType(
    baseRecord: VcsFileRecord | undefined,
    curRecord: VcsFileRecord,
  ): VcsChangeType | undefined {
    if (!baseRecord) return "CREATED";
    if (baseRecord.sha256 !== curRecord.sha256) return "MODIFIED";
    return undefined;
  }

  private buildChangedFile(
    record: VcsFileRecord,
    changeType: VcsChangeType,
    previousSha256?: string,
  ): VcsChangedFile {
    const content = fileUtils.exists(record.fullPath)
      ? fileUtils.readFileSync(record.fullPath)
      : undefined;
    return {
      relativePath: record.relativePath,
      fullPath: record.fullPath,
      changeType,
      previousSha256,
      currentSha256: record.sha256,
      content,
    };
  }

  public async commitChanges(): Promise<string | undefined> {
    return undefined;
  }
}

export class GitCliVcsEngine implements IVcsEngine {
  public readonly name = "GitCliVcsEngine";

  public async initialize(dirPath: string): Promise<boolean> {
    fileUtils.ensureDirectory(dirPath);
    const gitDir = pathUtils.join(dirPath, ".git");
    if (fileUtils.exists(gitDir)) return true;

    try {
      await childProcessUtils.exec(`git init -q`, { cwd: dirPath });
      await childProcessUtils.exec(`git config user.name "ModelBox Platform"`, { cwd: dirPath });
      await childProcessUtils.exec(`git config user.email "bot@modelbox.local"`, { cwd: dirPath });
      await childProcessUtils.exec(`git add -A`, { cwd: dirPath });
      await childProcessUtils.exec(`git commit --allow-empty -q -m "chore(vcs): init local credentials tracking"`, { cwd: dirPath });
      logger.info(`[GitCliVcsEngine] Initialized local git version control in ${dirPath}`);
      return true;
    } catch (err: unknown) {
      logger.warn(`[GitCliVcsEngine] Local git init failed (falling back to snapshot engine): ${String(err)}`);
      return false;
    }
  }

  public async captureSnapshot(dirPath: string, snapshotId: string): Promise<VcsSnapshot> {
    const hashEngine = new HashSnapshotVcsEngine();
    const snapshot = await hashEngine.captureSnapshot(dirPath, snapshotId);
    const commitHash = await this.readHeadCommitHash(dirPath);
    return {
      ...snapshot,
      gitCommitHash: commitHash,
    };
  }

  private async readHeadCommitHash(dirPath: string): Promise<string | undefined> {
    try {
      const res = await childProcessUtils.exec(`git rev-parse HEAD`, { cwd: dirPath });
      return res.stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  public async computeDiff(baseSnapshot: VcsSnapshot, currentDir: string): Promise<readonly VcsChangedFile[]> {
    const hashEngine = new HashSnapshotVcsEngine();
    return hashEngine.computeDiff(baseSnapshot, currentDir);
  }

  public async commitChanges(dirPath: string, message: string): Promise<string | undefined> {
    try {
      await childProcessUtils.exec(`git add -A`, { cwd: dirPath });
      const statusRes = await childProcessUtils.exec(`git status --porcelain`, { cwd: dirPath });
      if (!statusRes.stdout.trim()) {
        return this.readHeadCommitHash(dirPath);
      }
      const safeMsg = message.replace(/"/g, '\\"');
      await childProcessUtils.exec(`git commit -q -m "${safeMsg}"`, { cwd: dirPath });
      const newHash = await this.readHeadCommitHash(dirPath);
      logger.info(`[GitCliVcsEngine] Created local commit ${newHash}: ${message}`);
      return newHash;
    } catch (err: unknown) {
      logger.warn(`[GitCliVcsEngine] Failed to commit changes locally: ${String(err)}`);
      return undefined;
    }
  }
}

export class CompositeVcsEngine implements IVcsEngine {
  public readonly name = "CompositeVcsEngine";
  private readonly gitEngine = new GitCliVcsEngine();
  private readonly hashEngine = new HashSnapshotVcsEngine();

  public async initialize(dirPath: string): Promise<boolean> {
    await this.hashEngine.initialize(dirPath);
    const gitReady = await this.gitEngine.initialize(dirPath);
    return gitReady;
  }

  public async captureSnapshot(dirPath: string, snapshotId: string): Promise<VcsSnapshot> {
    return this.gitEngine.captureSnapshot(dirPath, snapshotId);
  }

  public async computeDiff(baseSnapshot: VcsSnapshot, currentDir: string): Promise<readonly VcsChangedFile[]> {
    return this.hashEngine.computeDiff(baseSnapshot, currentDir);
  }

  public async commitChanges(dirPath: string, message: string): Promise<string | undefined> {
    return this.gitEngine.commitChanges(dirPath, message);
  }
}

