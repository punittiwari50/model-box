import type { Environment } from "@/config/environment.js";

export interface IWebsocketConfig {
  readonly path: string;
  readonly heartbeatIntervalMs: number;
  readonly reconnectMaxAttempts: number;
  readonly reconnectBackoffMs: number;
  readonly maxPayloadBytes: number;
}

export class WebsocketConfig implements IWebsocketConfig {
  public readonly path: string;
  public readonly heartbeatIntervalMs: number;
  public readonly reconnectMaxAttempts: number;
  public readonly reconnectBackoffMs: number;
  public readonly maxPayloadBytes: number;

  constructor(env: Environment) {
    this.path = env.getProperty("websocket.path", "/ws");
    this.heartbeatIntervalMs = env.getPropertyAsNumber("websocket.heartbeatIntervalMs", 30000);
    this.reconnectMaxAttempts = env.getPropertyAsNumber("websocket.reconnectMaxAttempts", 5);
    this.reconnectBackoffMs = env.getPropertyAsNumber("websocket.reconnectBackoffMs", 1000);
    this.maxPayloadBytes = env.getPropertyAsNumber("websocket.maxPayloadBytes", 1024 * 1024 * 4); // 4MB
  }
}
