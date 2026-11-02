import fs from "node:fs";
import { PathUtils } from "@/utils/file/pathUtils.js";

export interface IFileUtils {
  readFile(filePath: string): Promise<string>;
  readFileSync(filePath: string): string;
  writeFile(filePath: string, content: string): Promise<void>;
  writeFileSync(filePath: string, content: string): void;
  exists(filePath: string): boolean;
  ensureDirectory(dirPath: string): void;
  readdirSync(dirPath: string): string[];
  statSync(filePath: string): fs.Stats;
  isDirectory(filePath: string): boolean;
  readJson<T = unknown>(filePath: string): Promise<T>;
  writeJson<T = unknown>(filePath: string, data: T): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  unlinkSync(filePath: string): void;
  copyFile(src: string, dest: string): Promise<void>;
}

export class FileUtils implements IFileUtils {
  public async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, "utf-8");
  }

  public readFileSync(filePath: string): string {
    return fs.readFileSync(filePath, "utf-8");
  }

  public async writeFile(filePath: string, content: string): Promise<void> {
    this.ensureDirectory(PathUtils.dirname(filePath));
    await fs.promises.writeFile(filePath, content, "utf-8");
  }

  public writeFileSync(filePath: string, content: string): void {
    this.ensureDirectory(PathUtils.dirname(filePath));
    fs.writeFileSync(filePath, content, "utf-8");
  }

  public exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  public ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  public readdirSync(dirPath: string): string[] {
    return fs.readdirSync(dirPath);
  }

  public statSync(filePath: string): fs.Stats {
    return fs.statSync(filePath);
  }

  public isDirectory(filePath: string): boolean {
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  }

  public async readJson<T = unknown>(filePath: string): Promise<T> {
    const raw = await this.readFile(filePath);
    return JSON.parse(raw) as T;
  }

  public async writeJson<T = unknown>(filePath: string, data: T): Promise<void> {
    await this.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  public async deleteFile(filePath: string): Promise<void> {
    if (this.exists(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  public unlinkSync(filePath: string): void {
    if (this.exists(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  public async copyFile(src: string, dest: string): Promise<void> {
    this.ensureDirectory(PathUtils.dirname(dest));
    await fs.promises.copyFile(src, dest);
  }
}

export const fileUtils: IFileUtils = new FileUtils();
