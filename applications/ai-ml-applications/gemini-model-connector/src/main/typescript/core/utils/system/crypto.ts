import crypto from "node:crypto";

export interface ICryptoUtils {
  randomUUID(): string;
  randomBytes(size: number): Buffer;
  randomHex(size: number): string;
  randomBase64Url(size: number): string;
  sha256Hex(data: string | Buffer): string;
  sha256Base64Url(data: string | Buffer): string;
  createHash(algorithm: string): crypto.Hash;
  timingSafeEqual(a: Buffer, b: Buffer): boolean;
}

/**
 * Cryptographic Utility.
 * Encapsulates global node:crypto hashing and random byte generation.
 */
export class CryptoUtils implements ICryptoUtils {
  public randomUUID(): string {
    return crypto.randomUUID();
  }

  public randomBytes(size: number): Buffer {
    return crypto.randomBytes(size);
  }

  public randomHex(size: number): string {
    return crypto.randomBytes(size).toString("hex");
  }

  public randomBase64Url(size: number): string {
    return crypto.randomBytes(size).toString("base64url");
  }

  public sha256Hex(data: string | Buffer): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  public sha256Base64Url(data: string | Buffer): string {
    return crypto.createHash("sha256").update(data).digest("base64url");
  }

  public createHash(algorithm: string): crypto.Hash {
    return crypto.createHash(algorithm);
  }

  public timingSafeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }
}

export const cryptoUtils = new CryptoUtils();
