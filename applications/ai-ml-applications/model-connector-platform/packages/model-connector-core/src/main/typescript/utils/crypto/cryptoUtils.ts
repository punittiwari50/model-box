import crypto from "node:crypto";

export interface ICryptoUtils {
  generateUuid(): string;
  randomUuid(): string;
  sha256(data: string): string;
  maskSecret(secret?: string, visibleChars?: number): string;
  createHash(algorithm: string): crypto.Hash;
  createHmac(algorithm: string, key: crypto.BinaryLike | crypto.KeyObject): crypto.Hmac;
  randomBytes(size: number): Buffer;
  timingSafeEqual(a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView): boolean;
  createCipheriv(algorithm: string, key: crypto.CipherKey, iv: crypto.BinaryLike | null): crypto.Cipher;
  createDecipheriv(algorithm: string, key: crypto.CipherKey, iv: crypto.BinaryLike | null): crypto.Decipher;
}

/**
 * Enterprise Cryptographic Utility.
 * Exclusive authority for node:crypto access across the platform.
 * Conforms to:
 * - STD-COD-010: Runtime Isolation & Encapsulation
 * - STD-COD-007: Clean Code & Immutability by Default
 */
export class CryptoUtils implements ICryptoUtils {
  public static generateUuid(): string {
    return crypto.randomUUID();
  }

  public static randomUuid(): string {
    return crypto.randomUUID();
  }

  public static sha256(data: string): string {
    return crypto.createHash("sha256").update(data, "utf-8").digest("hex");
  }

  public static maskSecret(secret?: string, visibleChars = 4): string {
    if (!secret || secret.length <= visibleChars * 2) {
      return "******";
    }
    const start = secret.slice(0, visibleChars);
    const end = secret.slice(-visibleChars);
    return `${start}...${end}`;
  }

  public static createHash(algorithm: string): crypto.Hash {
    return crypto.createHash(algorithm);
  }

  public static createHmac(algorithm: string, key: crypto.BinaryLike | crypto.KeyObject): crypto.Hmac {
    return crypto.createHmac(algorithm, key);
  }

  public static randomBytes(size: number): Buffer {
    return crypto.randomBytes(size);
  }

  public static timingSafeEqual(a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView): boolean {
    return crypto.timingSafeEqual(a, b);
  }

  public static createCipheriv(
    algorithm: string,
    key: crypto.CipherKey,
    iv: crypto.BinaryLike | null,
  ): crypto.Cipher {
    return crypto.createCipheriv(algorithm, key, iv);
  }

  public static createDecipheriv(
    algorithm: string,
    key: crypto.CipherKey,
    iv: crypto.BinaryLike | null,
  ): crypto.Decipher {
    return crypto.createDecipheriv(algorithm, key, iv);
  }

  public generateUuid(): string {
    return CryptoUtils.generateUuid();
  }

  public randomUuid(): string {
    return CryptoUtils.randomUuid();
  }

  public sha256(data: string): string {
    return CryptoUtils.sha256(data);
  }

  public maskSecret(secret?: string, visibleChars = 4): string {
    return CryptoUtils.maskSecret(secret, visibleChars);
  }

  public createHash(algorithm: string): crypto.Hash {
    return CryptoUtils.createHash(algorithm);
  }

  public createHmac(algorithm: string, key: crypto.BinaryLike | crypto.KeyObject): crypto.Hmac {
    return CryptoUtils.createHmac(algorithm, key);
  }

  public randomBytes(size: number): Buffer {
    return CryptoUtils.randomBytes(size);
  }

  public timingSafeEqual(a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView): boolean {
    return CryptoUtils.timingSafeEqual(a, b);
  }

  public createCipheriv(
    algorithm: string,
    key: crypto.CipherKey,
    iv: crypto.BinaryLike | null,
  ): crypto.Cipher {
    return CryptoUtils.createCipheriv(algorithm, key, iv);
  }

  public createDecipheriv(
    algorithm: string,
    key: crypto.CipherKey,
    iv: crypto.BinaryLike | null,
  ): crypto.Decipher {
    return CryptoUtils.createDecipheriv(algorithm, key, iv);
  }
}

export const cryptoUtils: ICryptoUtils = new CryptoUtils();
export const randomUUID = (): string => crypto.randomUUID();
