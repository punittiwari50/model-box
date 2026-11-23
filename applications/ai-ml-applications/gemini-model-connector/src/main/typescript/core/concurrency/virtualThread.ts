/**
 * Enterprise Virtual Thread & Structured Concurrency Engine.
 * Inspired by JDK 25 Project Loom (Virtual Threads & StructuredTaskScope).
 * Conforms to:
 * - Directive #1: Virtual Thread and Structured Concurrency abstraction in Node.js
 * - STD-COD-005: OOP Strategy & Concurrency Governance
 * - STD-COD-007: Resilient Error Handling & Zero Swallowed Exceptions
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface TaskContext {
  readonly taskId: string;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spawnedAt: number;
}

const taskContextStorage = new AsyncLocalStorage<TaskContext>();

export function getCurrentTaskContext(): TaskContext | undefined {
  return taskContextStorage.getStore();
}

export type TaskState =
  "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";

export interface Subtask<T> {
  readonly id: string;
  readonly state: TaskState;
  get(): T;
  exception(): Error | undefined;
}

class SubtaskImpl<T> implements Subtask<T> {
  public state: TaskState = "PENDING";
  private result?: T;
  private error?: Error;

  constructor(public readonly id: string) {}

  public complete(value: T): void {
    this.state = "SUCCESS";
    this.result = value;
  }

  public fail(err: Error): void {
    this.state = "FAILED";
    this.error = err;
  }

  public cancel(): void {
    if (this.state === "PENDING" || this.state === "RUNNING") {
      this.state = "CANCELLED";
    }
  }

  public get(): T {
    if (this.state === "SUCCESS") {
      return this.result as T;
    }
    if (this.state === "FAILED") {
      throw (
        this.error ??
        new Error(`Subtask '${this.id}' failed without an explicit error.`)
      );
    }
    throw new IllegalStateException(
      `Subtask '${this.id}' has not completed successfully (state: ${this.state}).`,
    );
  }

  public exception(): Error | undefined {
    return this.error;
  }
}

export class IllegalStateException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalStateException";
  }
}

export class TimeoutException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutException";
  }
}

/**
 * StructuredTaskScope coordinates concurrent subtasks with strict lifecycle boundaries.
 * Mirrors JDK 25 StructuredTaskScope.ShutdownOnFailure and ShutdownOnSuccess.
 */
export abstract class StructuredTaskScope<T> {
  protected readonly subtasks: SubtaskImpl<T>[] = [];
  protected readonly abortController = new AbortController();
  protected isClosed = false;

  public get signal(): AbortSignal {
    return this.abortController.signal;
  }

  public abstract handleComplete(subtask: SubtaskImpl<T>): void;

  public fork(task: (signal: AbortSignal) => Promise<T>): Subtask<T> {
    if (this.isClosed) {
      throw new IllegalStateException(
        "Cannot fork tasks in a closed StructuredTaskScope.",
      );
    }

    const taskId = `vtask-${Math.random().toString(36).substring(2, 9)}`;
    const subtask = new SubtaskImpl<T>(taskId);
    this.subtasks.push(subtask);

    const parentContext = getCurrentTaskContext();
    const subtaskContext: TaskContext = {
      taskId,
      correlationId: parentContext?.correlationId,
      traceId: parentContext?.traceId,
      spawnedAt: Date.now(),
    };

    taskContextStorage.run(subtaskContext, async () => {
      subtask.state = "RUNNING";
      try {
        if (this.signal.aborted) {
          subtask.cancel();
          return;
        }
        const val = await task(this.signal);
        if (this.signal.aborted) {
          subtask.cancel();
        } else {
          subtask.complete(val);
          this.handleComplete(subtask);
        }
      } catch (err: any) {
        subtask.fail(err instanceof Error ? err : new Error(String(err)));
        this.handleComplete(subtask);
      }
    });

    return subtask;
  }

  public static open<T>(
    policy?: "shutdown-on-failure",
  ): ShutdownOnFailureScope<T>;
  public static open<T>(
    policy: "shutdown-on-success",
  ): ShutdownOnSuccessScope<T>;
  public static open<T>(
    policy:
      "shutdown-on-failure" | "shutdown-on-success" = "shutdown-on-failure",
  ): StructuredTaskScope<T> {
    if (policy === "shutdown-on-success") {
      return new ShutdownOnSuccessScope<T>();
    }
    return new ShutdownOnFailureScope<T>();
  }

  public async join(): Promise<this> {
    const start = Date.now();
    // Wait until all subtasks reach terminal state or scope is cancelled
    while (
      this.subtasks.some((t) => t.state === "PENDING" || t.state === "RUNNING")
    ) {
      if (this.signal.aborted) {
        for (const t of this.subtasks) {
          if (t.state === "PENDING" || t.state === "RUNNING") {
            t.cancel();
          }
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 5));
      if (Date.now() - start > 5000) {
        for (const t of this.subtasks) {
          if (t.state === "RUNNING" || t.state === "PENDING") {
            t.cancel();
          }
        }
        break;
      }
    }
    return this;
  }

  public async joinUntil(timeoutMs: number): Promise<this> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new TimeoutException(`Task scope timed out after ${timeoutMs}ms`),
          ),
        timeoutMs,
      );
      timer.unref?.();
    });
    try {
      await Promise.race([this.join(), timeoutPromise]);
      return this;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  public close(): void {
    this.isClosed = true;
    if (!this.signal.aborted) {
      this.abortController.abort();
    }
  }

  public results(): T[] {
    return this.subtasks
      .filter((t) => t.state === "SUCCESS")
      .map((t) => t.get());
  }
}

/**
 * Scope policy that shuts down all subtasks on the first failure.
 * Mirrors JDK 25 StructuredTaskScope.ShutdownOnFailure.
 */
export class ShutdownOnFailureScope<T> extends StructuredTaskScope<T> {
  private firstFailure?: Error;

  public handleComplete(subtask: SubtaskImpl<T>): void {
    if (subtask.state === "FAILED" && !this.firstFailure) {
      this.firstFailure = subtask.exception();
      this.abortController.abort();
    }
  }

  public throwIfFailed(): this {
    if (this.firstFailure) {
      throw this.firstFailure;
    }
    return this;
  }
}

/**
 * Scope policy that returns the first successful subtask result and cancels others.
 * Mirrors JDK 25 StructuredTaskScope.ShutdownOnSuccess.
 */
export class ShutdownOnSuccessScope<T> extends StructuredTaskScope<T> {
  private firstSuccess?: Subtask<T>;

  public handleComplete(subtask: SubtaskImpl<T>): void {
    if (subtask.state === "SUCCESS" && !this.firstSuccess) {
      this.firstSuccess = subtask;
      this.abortController.abort();
    }
  }

  public result(): T {
    if (this.firstSuccess) {
      return this.firstSuccess.get();
    }
    const failures = this.subtasks
      .map((t) => t.exception()?.message)
      .filter(Boolean);
    throw new IllegalStateException(
      `No subtask completed successfully. Errors: ${failures.join(", ")}`,
    );
  }
}

/**
 * Enterprise Virtual Thread Executor.
 * Manages lightweight concurrent task execution, thread isolation, bounded concurrency, and structured scopes.
 */
export class VirtualThreadExecutor {
  private readonly maxConcurrency: number;
  private activeTasks = 0;
  private readonly waitQueue: (() => void)[] = [];

  constructor(
    optionsOrMaxConcurrency: number | { maxConcurrency?: number } = 500,
  ) {
    if (typeof optionsOrMaxConcurrency === "number") {
      this.maxConcurrency = optionsOrMaxConcurrency;
    } else if (
      typeof optionsOrMaxConcurrency === "object" &&
      optionsOrMaxConcurrency !== null
    ) {
      this.maxConcurrency = optionsOrMaxConcurrency.maxConcurrency ?? 500;
    } else {
      this.maxConcurrency = 500;
    }
  }

  public async execute<R>(
    task: (signal: AbortSignal) => Promise<R>,
    timeoutMs = 30000,
  ): Promise<R> {
    await this.acquireSlot();
    const abortController = new AbortController();
    const timer = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);
    timer.unref?.();

    const taskId = `vt-${Math.random().toString(36).substring(2, 9)}`;
    const context: TaskContext = {
      taskId,
      spawnedAt: Date.now(),
    };

    try {
      return await taskContextStorage.run(context, async () => {
        return await task(abortController.signal);
      });
    } finally {
      clearTimeout(timer);
      this.releaseSlot();
    }
  }

  public openShutdownOnFailure<T>(): ShutdownOnFailureScope<T> {
    return new ShutdownOnFailureScope<T>();
  }

  public openShutdownOnSuccess<T>(): ShutdownOnSuccessScope<T> {
    return new ShutdownOnSuccessScope<T>();
  }

  public getActiveTaskCount(): number {
    return this.activeTasks;
  }

  public getQueueLength(): number {
    return this.waitQueue.length;
  }

  private acquireSlot(): Promise<void> {
    if (this.activeTasks < this.maxConcurrency) {
      this.activeTasks++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeTasks++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeTasks--;
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        next();
      }
    }
  }
}

export const virtualThreadExecutor = new VirtualThreadExecutor();
