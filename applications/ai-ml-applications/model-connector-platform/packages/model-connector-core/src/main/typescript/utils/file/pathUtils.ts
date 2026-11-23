import path from "node:path";

export interface IPathUtils {
  readonly sep: string;
  readonly delimiter: string;
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
  dirname(filePath: string): string;
  basename(filePath: string, ext?: string): string;
  extname(filePath: string): string;
  relative(from: string, to: string): string;
  normalize(filePath: string): string;
  isAbsolute(filePath: string): boolean;
}

/**
 * Enterprise Path Utility.
 * Exclusive authority for node:path resolution across the platform.
 * Conforms to:
 * - STD-COD-010: Runtime Isolation & Encapsulation
 * - STD-COD-001: Boundary Integrity
 */
export class PathUtils implements IPathUtils {
  public get sep(): string {
    return path.sep;
  }

  public get delimiter(): string {
    return path.delimiter;
  }

  public static join(...paths: string[]): string {
    return path.join(...paths);
  }

  public static resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  public static dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  public static basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  public static extname(filePath: string): string {
    return path.extname(filePath);
  }

  public static relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  public static normalize(filePath: string): string {
    return path.normalize(filePath);
  }

  public static isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  public join(...paths: string[]): string {
    return PathUtils.join(...paths);
  }

  public resolve(...paths: string[]): string {
    return PathUtils.resolve(...paths);
  }

  public dirname(filePath: string): string {
    return PathUtils.dirname(filePath);
  }

  public basename(filePath: string, ext?: string): string {
    return PathUtils.basename(filePath, ext);
  }

  public extname(filePath: string): string {
    return PathUtils.extname(filePath);
  }

  public relative(from: string, to: string): string {
    return PathUtils.relative(from, to);
  }

  public normalize(filePath: string): string {
    return PathUtils.normalize(filePath);
  }

  public isAbsolute(filePath: string): boolean {
    return PathUtils.isAbsolute(filePath);
  }
}

export const pathUtils: IPathUtils = new PathUtils();
