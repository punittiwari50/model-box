import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ILogWriter {
  write(formatted: string): void;
}

export class ConsoleLogWriter implements ILogWriter {
  constructor(private readonly method: 'debug' | 'info' | 'warn' | 'error') {}

  write(formatted: string): void {
    console[this.method](formatted);
  }
}

export class NullLogWriter implements ILogWriter {
  write(): void {}
}

export class EngineLogger {
  private level: LogLevel = 'info';

  private static readonly LEVEL_WEIGHTS: Readonly<Record<LogLevel, number>> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private isLevelActive(targetLevel: LogLevel): boolean {
    const targetWeight = EngineLogger.LEVEL_WEIGHTS[targetLevel];
    const currentWeight = EngineLogger.LEVEL_WEIGHTS[this.level];
    return targetWeight >= currentWeight;
  }

  private resolveWriter(targetLevel: LogLevel, activeWriter: ILogWriter): ILogWriter {
    const isAllowed = this.isLevelActive(targetLevel);
    const lookup: Record<string, ILogWriter> = {
      true: activeWriter,
      false: new NullLogWriter(),
    };
    return lookup[String(isAllowed)] ?? new NullLogWriter();
  }

  private formatTime(): string {
    return new Date().toISOString().substring(11, 23);
  }

  private serializeContext(context?: Record<string, unknown>): string {
    const hasContext = Boolean(context);
    const serializers: Record<string, () => string> = {
      true: () => ` ${JSON.stringify(context)}`,
      false: () => '',
    };
    return serializers[String(hasContext)]();
  }

  debug(message: string, context?: Record<string, unknown>): void {
    const writer = this.resolveWriter('debug', new ConsoleLogWriter('debug'));
    const ctx = this.serializeContext(context);
    writer.write(`${chalk.gray(this.formatTime())} ${chalk.magenta('[DEBUG]')} ${message}${ctx}`);
  }

  info(message: string, context?: Record<string, unknown>): void {
    const writer = this.resolveWriter('info', new ConsoleLogWriter('info'));
    const ctx = this.serializeContext(context);
    writer.write(`${chalk.gray(this.formatTime())} ${chalk.cyan('[INFO]')} ${message}${ctx}`);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    const writer = this.resolveWriter('warn', new ConsoleLogWriter('warn'));
    const ctx = this.serializeContext(context);
    writer.write(`${chalk.gray(this.formatTime())} ${chalk.yellow('[WARN]')} ${message}${ctx}`);
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const writer = this.resolveWriter('error', new ConsoleLogWriter('error'));
    const hasError = Boolean(error);
    const isErrorObj = error instanceof Error;

    const errorFormatters: Record<string, () => string> = {
      true: () => ` - ${(error as Error).message}\n${(error as Error).stack}`,
      false: () => {
        const fallbackFormatters: Record<string, () => string> = {
          true: () => ` - ${String(error)}`,
          false: () => '',
        };
        return fallbackFormatters[String(hasError)]();
      },
    };

    const errStr = errorFormatters[String(isErrorObj)]();
    const ctx = this.serializeContext(context);
    writer.write(`${chalk.gray(this.formatTime())} ${chalk.red('[ERROR]')} ${message}${errStr}${ctx}`);
  }

  concurrency(active: number, max: number, queue: number): void {
    const writer = this.resolveWriter('debug', new ConsoleLogWriter('debug'));
    writer.write(
      `${chalk.gray(this.formatTime())} ${chalk.blueBright('[CONCURRENCY]')} Active: ${chalk.green(active)}/${chalk.yellow(max)} | Queued: ${chalk.cyan(queue)}`
    );
  }
}

export const logger = new EngineLogger();
