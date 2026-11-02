import { cryptoUtils } from "@model-box/model-connector-core";

export interface EncryptedVaultPayload {
  readonly ciphertextHex: string;
  readonly ivHex: string;
  readonly authTagHex: string;
  readonly keyVersion: number;
}

export interface EmulatedBrowserHeaders {
  readonly "user-agent": string;
  readonly "sec-ch-ua": string;
  readonly "sec-ch-ua-mobile": string;
  readonly "sec-ch-ua-platform": string;
  readonly cookie?: string;
}

/**
 * AES-256-GCM Cookie Vault & Session Ingestion Manager.
 * Conforms to:
 * - UC-15 §1.3, §3.1 & HLD §13.1: Cryptographic Vaulting of Web Credentials
 * - STD-COD-011: Encapsulated node:crypto access via cryptoUtils
 * - STD-COD-007: Immutability by Default
 */
export class CookieVaultManager {
  private static readonly CIPHER_ALGO = "aes-256-gcm";
  private static readonly IV_BYTE_LENGTH = 12;
  private static readonly DEFAULT_KEY_VERSION = 1;

  public static encryptCookieJar(
    cookies: Record<string, string>,
    tenantSecretKey: string,
  ): EncryptedVaultPayload {
    const keyBuffer = this.derive32ByteKey(tenantSecretKey);
    const ivBuffer = cryptoUtils.randomBytes(this.IV_BYTE_LENGTH);
    const cipher = cryptoUtils.createCipheriv(this.CIPHER_ALGO, keyBuffer, ivBuffer);

    const plaintext = JSON.stringify(cookies);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const authTag = (cipher as unknown as { getAuthTag(): Buffer }).getAuthTag();

    return Object.freeze({
      ciphertextHex: encrypted.toString("hex"),
      ivHex: ivBuffer.toString("hex"),
      authTagHex: authTag.toString("hex"),
      keyVersion: this.DEFAULT_KEY_VERSION,
    });
  }

  public static decryptCookieJar(
    vaultPayload: EncryptedVaultPayload,
    tenantSecretKey: string,
  ): Record<string, string> {
    const keyBuffer = this.derive32ByteKey(tenantSecretKey);
    const ivBuffer = Buffer.from(vaultPayload.ivHex, "hex");
    const authTag = Buffer.from(vaultPayload.authTagHex, "hex");
    const decipher = cryptoUtils.createDecipheriv(this.CIPHER_ALGO, keyBuffer, ivBuffer);
    (decipher as unknown as { setAuthTag(tag: Buffer): void }).setAuthTag(authTag);

    const ciphertext = Buffer.from(vaultPayload.ciphertextHex, "hex");
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf-8"));
  }

  public static generateBrowserHeaders(cookies?: Record<string, string>): EmulatedBrowserHeaders {
    const cookieString = cookies ? this.formatCookieString(cookies) : undefined;
    return Object.freeze({
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      ...(cookieString ? { cookie: cookieString } : {}),
    });
  }

  public static formatCookieString(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("; ");
  }

  public static isCookieSessionFresh(expiresAtMs?: number): boolean {
    if (!expiresAtMs) {
      return true;
    }
    return Date.now() < expiresAtMs;
  }

  private static derive32ByteKey(secret: string): Buffer {
    const hashHex = cryptoUtils.sha256(secret);
    return Buffer.from(hashHex.slice(0, 64), "hex");
  }
}
