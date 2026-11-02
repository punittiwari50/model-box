import { performance } from "node:perf_hooks";

export interface ITimerUtils {
  now(): number;
  measure<T>(fn: () => T | Promise<T>): Promise<{ readonly result: T; readonly durationMs: number }>;
  timeElapsedMs(startMs: number): number;
}

/**
 * Enterprise Performance & Timing Utility.
 * Exclusive authority for node:perf_hooks and performance metrics.
 * Conforms to:
 * - STD-COD-010: Runtime Isolation & Encapsulation
 * - STD-COD-007: Clean Code & High-Precision Metrics
 */
export class TimerUtils implements ITimerUtils {
  public static now(): number {
    return performance.now();
  }

  public static async measure<T>(
    fn: () => T | Promise<T>
  ): Promise<{ readonly result: T; readonly durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;
    return Object.freeze({ result, durationMs });
  }

  public static timeElapsedMs(startMs: number): number {
    return performance.now() - startMs;
  }

  public now(): number {
    return TimerUtils.now();
  }

  public async measure<T>(
    fn: () => T | Promise<T>
  ): Promise<{ readonly result: T; readonly durationMs: number }> {
    return TimerUtils.measure(fn);
  }

  public timeElapsedMs(startMs: number): number {
    return TimerUtils.timeElapsedMs(startMs);
  }
}

export const timerUtils: ITimerUtils = new TimerUtils();
