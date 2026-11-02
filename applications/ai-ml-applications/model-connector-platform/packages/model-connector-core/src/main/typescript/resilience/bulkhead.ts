export class BulkheadFullException extends Error {
  constructor(public readonly bulkheadName: string) {
    super(`[Bulkhead:${bulkheadName}] Execution capacity exhausted. All slots occupied.`);
    this.name = "BulkheadFullException";
  }
}

export class Bulkhead {
  private activeCount = 0;

  constructor(
    public readonly name: string,
    public readonly maxConcurrentCalls: number = 25
  ) {}

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrentCalls) {
      throw new BulkheadFullException(this.name);
    }

    this.activeCount++;
    try {
      return await action();
    } finally {
      this.activeCount--;
    }
  }

  public get availableSlots(): number {
    return Math.max(0, this.maxConcurrentCalls - this.activeCount);
  }
}
