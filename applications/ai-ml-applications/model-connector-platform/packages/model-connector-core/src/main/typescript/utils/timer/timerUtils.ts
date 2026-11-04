import { performance } from "node:perf_hooks";

export interface ITimerUtils {
  now(): number;
  measure<T>(fn: () => T | Promise<T>): Promise<{ readonly result: T; readonly durationMs: number }>;
  timeElapsedMs(startMs: number): number;
  setInterval(callback: () => void, ms: number): NodeJS.Timeout;
  clearInterval(intervalId: NodeJS.Timeout): void;
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(timeoutId: NodeJS.Timeout): void;
}

/**
 * Enterprise Performance & Timing Utility.
 * Exclusive authority for node:perf_hooks, timers, and performance metrics.
 * Conforms to:
 * - STD-COD-010: Runtime Isolation & Encapsulation
 * - STD-COD-011: Core Utils Encapsulation
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

  public static setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    return setInterval(callback, ms);
  }

  public static clearInterval(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
  }

  public static setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    return setTimeout(callback, ms);
  }

  public static clearTimeout(timeoutId: NodeJS.Timeout): void {
    clearTimeout(timeoutId);
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

  public setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    return TimerUtils.setInterval(callback, ms);
  }

  public clearInterval(intervalId: NodeJS.Timeout): void {
    TimerUtils.clearInterval(intervalId);
  }

  public setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    return TimerUtils.setTimeout(callback, ms);
  }

  public clearTimeout(timeoutId: NodeJS.Timeout): void {
    TimerUtils.clearTimeout(timeoutId);
  }
}

export const timerUtils: ITimerUtils = new TimerUtils();
