import { describe, it } from "node:test";
import assert from "node:assert";
import { securityFilterInstance } from "@/core/web/middleware/securityFilter.js";
import { maskSensitiveUrl, maskSensitiveData } from "@/core/observability/logging/logger.js";

describe("Anti-PII and Zero-URL-Leakage Security Verification", () => {
  function createMockContext(query: Record<string, unknown> = {}) {
    let statusCode = 200;
    let jsonBody: any = null;
    let nextCalled = false;
    const headers: Record<string, string> = {};

    const req: any = {
      query,
      headers: {},
    };

    const res: any = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: any) {
        jsonBody = data;
        return res;
      },
    };

    const next = () => {
      nextCalled = true;
    };

    return { req, res, next, getStatus: () => statusCode, getJson: () => jsonBody, isNextCalled: () => nextCalled, headers };
  }

  it("should set Referrer-Policy to no-referrer to prevent URL leaking on navigation or redirects", () => {
    const ctx = createMockContext();
    securityFilterInstance.filter(ctx.req, ctx.res, ctx.next);
    assert.strictEqual(ctx.headers["Referrer-Policy"], "no-referrer");
    assert.strictEqual(ctx.isNextCalled(), true);
  });

  it("should reject PII 'email' in URL query parameters with 400 Bad Request", () => {
    const ctx = createMockContext({ email: "user@example.com" });
    securityFilterInstance.filter(ctx.req, ctx.res, ctx.next);
    assert.strictEqual(ctx.getStatus(), 400);
    assert.strictEqual(ctx.isNextCalled(), false);
    assert.ok(ctx.getJson()?.error?.includes("Sensitive information or PII must not be passed"));
  });

  it("should reject PII 'account_email' or case-insensitive variants in URL query parameters", () => {
    const ctx = createMockContext({ Account_Email: "admin@enterprise.internal" });
    securityFilterInstance.filter(ctx.req, ctx.res, ctx.next);
    assert.strictEqual(ctx.getStatus(), 400);
    assert.strictEqual(ctx.isNextCalled(), false);
  });

  it("should reject credentials and tokens in URL query parameters", () => {
    const ctx = createMockContext({ token: "secret_oauth_token" });
    securityFilterInstance.filter(ctx.req, ctx.res, ctx.next);
    assert.strictEqual(ctx.getStatus(), 400);
    assert.strictEqual(ctx.isNextCalled(), false);
  });

  it("should allow safe non-PII query parameters to proceed to next middleware", () => {
    const ctx = createMockContext({ model: "gemini-3.8-flash", redirect: "true", limit: "50" });
    securityFilterInstance.filter(ctx.req, ctx.res, ctx.next);
    assert.strictEqual(ctx.getStatus(), 200);
    assert.strictEqual(ctx.isNextCalled(), true);
  });

  it("should scrub PII and sensitive parameters in maskSensitiveUrl", () => {
    const rawUrl = "/api/v1/auth/callback?model=gemini-3.8-flash&email=secret@domain.com&token=12345678";
    const masked = maskSensitiveUrl(rawUrl);
    assert.ok(!masked.includes("secret@domain.com"), "Email must not remain in masked URL");
    assert.ok(!masked.includes("12345678"), "Token must not remain in masked URL");
    assert.ok(masked.includes("model=gemini-3.8-flash"), "Safe model parameter must be retained");
  });

  it("should scrub email addresses in raw string messages in maskSensitiveData", () => {
    const text = "User contact is test.user@company.org in session";
    const masked = maskSensitiveData(text) as string;
    assert.ok(!masked.includes("test.user@company.org"), "Raw email must be masked");
    assert.ok(masked.includes("[REDACTED_EMAIL]"));
  });
});
