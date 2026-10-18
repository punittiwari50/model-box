import path from 'node:path';
import fs from 'node:fs';

export interface ISecureArtifactStorage {
  sanitizeFilename(filename: string, defaultName?: string): string;
  resolvePath(baseDir: string, filename: string): string;
  write(baseDir: string, filename: string, content: string): string;
  read(baseDir: string, filename: string): string;
}

/**
 * OOP Secure Artifact Storage Service.
 * Prevents path traversal and arbitrary file injection attacks.
 */
export class SecureArtifactStorage implements ISecureArtifactStorage {
  public sanitizeFilename(filename: string, defaultName = 'artifact.md'): string {
    if (!filename || typeof filename !== 'string') {
      return defaultName;
    }

    const base = path.basename(filename.trim());
    const sanitized = base.replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/^\.+/, '');
    return sanitized.length > 0 ? sanitized : defaultName;
  }

  public resolvePath(baseDir: string, filename: string): string {
    const cleanName = this.sanitizeFilename(filename);
    const resolvedBase = path.resolve(baseDir);
    const targetPath = path.resolve(resolvedBase, cleanName);

    const basePrefix = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;

    if (!targetPath.startsWith(basePrefix) && targetPath !== resolvedBase) {
      throw new Error(`Security Exception: Path traversal attempt detected: ${filename}`);
    }

    return targetPath;
  }

  public write(baseDir: string, filename: string, content: string): string {
    const safePath = this.resolvePath(baseDir, filename);
    fs.mkdirSync(path.dirname(safePath), { recursive: true });
    fs.writeFileSync(safePath, content, { encoding: 'utf-8' });
    return safePath;
  }

  public read(baseDir: string, filename: string): string {
    const safePath = this.resolvePath(baseDir, filename);
    if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
      throw new Error(`Artifact not found: ${filename}`);
    }
    return fs.readFileSync(safePath, { encoding: 'utf-8' });
  }
}

export const secureArtifactStorage = new SecureArtifactStorage();

export function safeWriteArtifact(baseDir: string, filename: string, content: string): string {
  return secureArtifactStorage.write(baseDir, filename, content);
}

export function safeReadArtifact(baseDir: string, filename: string): string {
  return secureArtifactStorage.read(baseDir, filename);
}
