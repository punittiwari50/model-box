/**
 * Enterprise Concurrency Utilities.
 * Provides Async Mutex, Semaphore, Timeout Wrappers, and Sleep primitives.
 */

export class AsyncMutex {
  private queue: Array<(release: () => void) => void> = [];
  private locked = false;

  public async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next(() => this.release());
    } else {
      this.locked = false;
    }
  }

  public async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class AsyncSemaphore {
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(public readonly maxConcurrency: number) {
    if (maxConcurrency <= 0) {
      throw new Error("[AsyncSemaphore] maxConcurrency must be greater than 0");
    }
  }

  public async acquire(): Promise<() => void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.activeCount++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  public get available(): number {
    return Math.max(0, this.maxConcurrency - this.activeCount);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out",
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
