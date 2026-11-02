import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CookieVaultManager } from "@/security/CookieVaultManager.js";

describe("CookieVaultManager AES-256-GCM Vault Tests (UC-15)", () => {
  const secretKey = "tenant-vault-master-secret-key-32b";
  const cookies = {
    "__Secure-1PSID": "test-gemini-secure-psid-token-999",
    "cf_clearance": "cloudflare-clearance-bypass-token",
    "sessionKey": "claude-session-key-val",
  };

  it("encrypts and decrypts cookie jars losslessly with AES-256-GCM", () => {
    const encrypted = CookieVaultManager.encryptCookieJar(cookies, secretKey);

    assert.ok(encrypted.ciphertextHex.length > 0);
    assert.ok(encrypted.ivHex.length === 24); // 12 bytes hex
    assert.ok(encrypted.authTagHex.length === 32); // 16 bytes hex

    const decrypted = CookieVaultManager.decryptCookieJar(encrypted, secretKey);
    assert.deepStrictEqual(decrypted, cookies);
  });

  it("fails decryption when ciphertext is tampered", () => {
    const encrypted = CookieVaultManager.encryptCookieJar(cookies, secretKey);
    const tampered = {
      ...encrypted,
      ciphertextHex: "bad" + encrypted.ciphertextHex.slice(3),
    };

    assert.throws(() => {
      CookieVaultManager.decryptCookieJar(tampered, secretKey);
    });
  });

  it("generates anti-bot emulated browser headers", () => {
    const headers = CookieVaultManager.generateBrowserHeaders(cookies);
    assert.ok(headers["user-agent"].includes("Mozilla"));
    assert.ok(headers["sec-ch-ua"].includes("Chromium"));
    assert.ok(headers.cookie?.includes("__Secure-1PSID"));
  });

  it("checks cookie session freshness", () => {
    const fresh = CookieVaultManager.isCookieSessionFresh(Date.now() + 60000);
    const expired = CookieVaultManager.isCookieSessionFresh(Date.now() - 1000);
    assert.strictEqual(fresh, true);
    assert.strictEqual(expired, false);
  });
});
