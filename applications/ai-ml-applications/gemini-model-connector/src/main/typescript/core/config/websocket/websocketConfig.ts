import type { Environment } from "@/core/config/environment.js";

export interface IWebsocketConfig {
  readonly enabled: boolean;
  readonly path: string;
  readonly heartbeatIntervalMs: number;
  readonly maxPayloadBytes: number;
  readonly clientTracking: boolean;
  readonly perMessageDeflate: boolean;
}

export class WebsocketConfig implements IWebsocketConfig {
  public readonly enabled: boolean;
  public readonly path: string;
  public readonly heartbeatIntervalMs: number;
  public readonly maxPayloadBytes: number;
  public readonly clientTracking: boolean;
  public readonly perMessageDeflate: boolean;

  constructor(env: Environment) {
    this.enabled = env.getPropertyAsBoolean("websocket.enabled", true);
    this.path = env.getProperty("websocket.path", "/ws/v1/stream");
    this.heartbeatIntervalMs = env.getPropertyAsNumber(
      "websocket.heartbeatIntervalMs",
      25000,
    );
    this.maxPayloadBytes = env.getPropertyAsNumber(
      "websocket.maxPayloadBytes",
      1048576,
    );
    this.clientTracking = env.getPropertyAsBoolean(
      "websocket.clientTracking",
      true,
    );
    this.perMessageDeflate = env.getPropertyAsBoolean(
      "websocket.perMessageDeflate",
      true,
    );
  }
}
