import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DistributedIdempotencyGuard } from "@/middleware/DistributedIdempotencyGuard";

describe("DistributedIdempotencyGuard Middleware Tests (STEP-09)", () => {
  it("allows first request and marks key as IN_FLIGHT", () => {
    DistributedIdempotencyGuard.clear();
    const middleware = DistributedIdempotencyGuard.middleware();

    let nextCalled = false;
    const req: any = { headers: { "idempotency-key": "key-001" } };
    const res: any = {
      statusCode: 200,
      setHeader: () => {},
      status: () => res,
      json: () => res,
    };

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    const record = DistributedIdempotencyGuard.getRecord("key-001");
    assert.strictEqual(record?.status, "IN_FLIGHT");
  });

  it("blocks duplicate in-flight requests with HTTP 409 Conflict", () => {
    const middleware = DistributedIdempotencyGuard.middleware();

    let responseStatus = 0;
    let responseBody: any = null;
    let nextCalled = false;

    const req: any = { headers: { "idempotency-key": "key-001" } };
    const res: any = {
      status: (code: number) => {
        responseStatus = code;
        return res;
      },
      json: (body: any) => {
        responseBody = body;
        return res;
      },
    };

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(responseStatus, 409);
    assert.strictEqual(responseBody?.error?.code, "IDEMPOTENT_OPERATION_IN_FLIGHT");
  });
});
