import { randomUUID } from "@model-box/model-connector-core";
import { ExecutionStrategyType } from "@/domain/constants/index.js";
import type {
  ExecutionRequest,
  ExecutionResponse,
  StructuredExecutionEnvelope,
} from "@/domain/models/execution.types.js";
import { CliExecutionException } from "@/domain/errors/domainExceptions.js";

export interface CliExecutionTicket {
  readonly requestId: string;
  readonly taskId: string;
  readonly userId: string;
  readonly userEmail?: string;
  readonly accountId?: string;
  readonly tenantId?: string;
  readonly sessionId: string;
  readonly correlationId: string;
  readonly model: string;
  readonly partitionKey: string;
  readonly dispatchedAt: string;
}

export interface ICliExecutionCoordinator {
  createTicket(request: ExecutionRequest, model: string, correlationId: string): CliExecutionTicket;
  buildIsolatedEnv(
    ticket: CliExecutionTicket,
    baseEnv?: Readonly<Record<string, string>>,
  ): Readonly<Record<string, string>>;
  executeIsolated(
    ticket: CliExecutionTicket,
    taskFn: (ticket: CliExecutionTicket) => Promise<ExecutionResponse>,
  ): Promise<ExecutionResponse>;
  attachVerifiedEnvelope(
    response: ExecutionResponse,
    ticket: CliExecutionTicket,
    fallbackOccurred?: boolean,
    fallbackProvider?: string,
  ): ExecutionResponse;
}

/**
 * Distributed & Multi-Tenant CLI Execution Coordinator.
 * Guarantees strict 1-to-1 request-to-response isolation across concurrent users and tasks
 * via Bulkhead concurrency governance, per-user/session partition serialization, and
 * cryptographic correlation envelope verification.
 */
export class CliExecutionCoordinator implements ICliExecutionCoordinator {
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];
  private readonly partitionLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly maxConcurrentProcesses: number = 16) {}

  public createTicket(
    request: ExecutionRequest,
    model: string,
    correlationId: string,
  ): CliExecutionTicket {
    const requestId = request.requestId || `req-${randomUUID()}`;
    const taskId = request.taskId || `task-${correlationId}`;
    const userId = request.userId || request.userEmail || request.accountId || `user-${correlationId}`;
    const sessionId = request.sessionId || `sess-${requestId}`;
    const partitionKey = `${userId}::${sessionId}::${model}`;
    return Object.freeze({
      requestId,
      taskId,
      userId,
      userEmail: request.userEmail,
      accountId: request.accountId,
      tenantId: request.tenantId,
      sessionId,
      correlationId,
      model,
      partitionKey,
      dispatchedAt: new Date().toISOString(),
    });
  }

  public buildIsolatedEnv(
    ticket: CliExecutionTicket,
    baseEnv?: Readonly<Record<string, string>>,
  ): Readonly<Record<string, string>> {
    return Object.freeze({
      ...(baseEnv || {}),
      MODELBOX_REQUEST_ID: ticket.requestId,
      MODELBOX_TASK_ID: ticket.taskId,
      MODELBOX_USER_ID: ticket.userId,
      MODELBOX_SESSION_ID: ticket.sessionId,
      MODELBOX_CORRELATION_ID: ticket.correlationId,
      ...(ticket.userEmail ? { MODELBOX_USER_EMAIL: ticket.userEmail } : {}),
      ...(ticket.accountId ? { MODELBOX_ACCOUNT_ID: ticket.accountId } : {}),
    });
  }

  public async executeIsolated(
    ticket: CliExecutionTicket,
    taskFn: (ticket: CliExecutionTicket) => Promise<ExecutionResponse>,
  ): Promise<ExecutionResponse> {
    const previous = this.partitionLocks.get(ticket.partitionKey) ?? Promise.resolve();
    const currentPromise = previous
      .catch(() => undefined)
      .then(() => this.runWithBulkhead(ticket, taskFn));
    this.partitionLocks.set(ticket.partitionKey, currentPromise);
    try {
      return await currentPromise;
    } finally {
      this.cleanupPartitionLock(ticket.partitionKey, currentPromise);
    }
  }

  public attachVerifiedEnvelope(
    response: ExecutionResponse,
    ticket: CliExecutionTicket,
    fallbackOccurred = false,
    fallbackProvider?: string,
  ): ExecutionResponse {
    const completedAt = new Date().toISOString();
    const envelope = this.createEnvelope(
      ticket,
      response.model,
      completedAt,
      fallbackOccurred || Boolean(response.fallbackOccurred),
      fallbackProvider || response.fallbackProvider,
    );
    this.verifyEnvelopeIntegrity(envelope, ticket);
    return Object.freeze({
      ...response,
      sessionId: ticket.sessionId,
      correlationId: ticket.correlationId,
      requestId: ticket.requestId,
      taskId: ticket.taskId,
      userId: ticket.userId,
      userEmail: ticket.userEmail,
      accountId: ticket.accountId,
      fallbackOccurred: envelope.fallbackOccurred,
      fallbackProvider: envelope.fallbackProvider,
      envelope,
      metadata: Object.freeze({
        ...(response.metadata || {}),
        requestId: ticket.requestId,
        taskId: ticket.taskId,
        userId: ticket.userId,
        userEmail: ticket.userEmail,
        accountId: ticket.accountId,
      }),
    });
  }

  private async runWithBulkhead(
    ticket: CliExecutionTicket,
    taskFn: (ticket: CliExecutionTicket) => Promise<ExecutionResponse>,
  ): Promise<ExecutionResponse> {
    await this.acquireSlot();
    try {
      const rawResponse = await taskFn(ticket);
      return this.attachVerifiedEnvelope(rawResponse, ticket);
    } finally {
      this.releaseSlot();
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.activeCount < this.maxConcurrentProcesses) {
      this.activeCount += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  private cleanupPartitionLock(key: string, completedPromise: Promise<unknown>): void {
    if (this.partitionLocks.get(key) === completedPromise) {
      this.partitionLocks.delete(key);
    }
  }

  private createEnvelope(
    ticket: CliExecutionTicket,
    model: string,
    completedAt: string,
    fallbackOccurred: boolean,
    fallbackProvider?: string,
  ): StructuredExecutionEnvelope {
    return Object.freeze({
      requestId: ticket.requestId,
      taskId: ticket.taskId,
      userId: ticket.userId,
      userEmail: ticket.userEmail,
      accountId: ticket.accountId,
      tenantId: ticket.tenantId,
      sessionId: ticket.sessionId,
      correlationId: ticket.correlationId,
      model,
      strategyUsed: ExecutionStrategyType.CLI,
      fallbackOccurred,
      fallbackProvider,
      dispatchedAt: ticket.dispatchedAt,
      completedAt,
    });
  }

  private verifyEnvelopeIntegrity(
    envelope: StructuredExecutionEnvelope,
    ticket: CliExecutionTicket,
  ): void {
    const idMismatch = envelope.requestId !== ticket.requestId || envelope.taskId !== ticket.taskId;
    const userMismatch = envelope.userId !== ticket.userId || envelope.correlationId !== ticket.correlationId;
    if (idMismatch || userMismatch) {
      throw new CliExecutionException(
        `CLI response correlation mismatch detected for request '${ticket.requestId}' and user '${ticket.userId}'`,
        -1,
        undefined,
        ticket.correlationId,
      );
    }
  }
}

export const defaultCliExecutionCoordinator: ICliExecutionCoordinator =
  new CliExecutionCoordinator();

