import type { Environment } from "@/core/config/environment.js";

export interface IHttp2Config {
  readonly enabled: boolean;
  readonly maxConcurrentStreams: number;
  readonly initialWindowSize: number;
  readonly maxFrameSize: number;
  readonly pingIntervalMs: number;
  readonly sessionTimeoutMs: number;
}

export class Http2Config implements IHttp2Config {
  public readonly enabled: boolean;
  public readonly maxConcurrentStreams: number;
  public readonly initialWindowSize: number;
  public readonly maxFrameSize: number;
  public readonly pingIntervalMs: number;
  public readonly sessionTimeoutMs: number;

  constructor(env: Environment) {
    this.enabled = env.getPropertyAsBoolean("http2.enabled", true);
    this.maxConcurrentStreams = env.getPropertyAsNumber(
      "http2.maxConcurrentStreams",
      100,
    );
    this.initialWindowSize = env.getPropertyAsNumber(
      "http2.initialWindowSize",
      65535,
    );
    this.maxFrameSize = env.getPropertyAsNumber("http2.maxFrameSize", 16384);
    this.pingIntervalMs = env.getPropertyAsNumber(
      "http2.pingIntervalMs",
      30000,
    );
    this.sessionTimeoutMs = env.getPropertyAsNumber(
      "http2.sessionTimeoutMs",
      120000,
    );
  }
}
