import fs from 'node:fs';

export interface IFileSystem {
  existsSync(filePath: string): boolean;
  readFileSync(filePath: string, encoding?: BufferEncoding): string;
  writeFileSync(filePath: string, data: string | Buffer): void;
  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void;
  unlinkSync(filePath: string): void;
  rmSync(filePath: string, options?: { force?: boolean; recursive?: boolean }): void;
  statSync(filePath: string): fs.Stats;
  createReadStream(filePath: string): fs.ReadStream;
  createWriteStream(filePath: string): fs.WriteStream;
}

/**
 * File System Utility.
 * Encapsulates global node:fs interactions.
 */
export class FileSystemUtils implements IFileSystem {
  public existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  public readFileSync(filePath: string, encoding: BufferEncoding = 'utf-8'): string {
    return fs.readFileSync(filePath, encoding);
  }

  public writeFileSync(filePath: string, data: string | Buffer): void {
    fs.writeFileSync(filePath, data);
  }

  public mkdirSync(dirPath: string, options: { recursive?: boolean } = { recursive: true }): void {
    fs.mkdirSync(dirPath, options);
  }

  public unlinkSync(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  public rmSync(filePath: string, options: { force?: boolean; recursive?: boolean } = { force: true }): void {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, options);
    }
  }

  public statSync(filePath: string): fs.Stats {
    return fs.statSync(filePath);
  }

  public createReadStream(filePath: string): fs.ReadStream {
    return fs.createReadStream(filePath);
  }

  public createWriteStream(filePath: string): fs.WriteStream {
    return fs.createWriteStream(filePath);
  }
}

export const fsUtils = new FileSystemUtils();
