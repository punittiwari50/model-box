import type { Environment } from "@/config/environment.js";

export interface IGrpcConfig {
  readonly host: string;
  readonly port: number;
  readonly maxReceiveMessageLength: number;
  readonly maxSendMessageLength: number;
  readonly keepAliveTimeMs: number;
  readonly keepAliveTimeoutMs: number;
  readonly useTls: boolean;
}

export class GrpcConfig implements IGrpcConfig {
  public readonly host: string;
  public readonly port: number;
  public readonly maxReceiveMessageLength: number;
  public readonly maxSendMessageLength: number;
  public readonly keepAliveTimeMs: number;
  public readonly keepAliveTimeoutMs: number;
  public readonly useTls: boolean;

  constructor(env: Environment) {
    this.host = env.getProperty("grpc.host", "127.0.0.1");
    this.port = env.getPropertyAsNumber("grpc.port", 50051);
    this.maxReceiveMessageLength = env.getPropertyAsNumber("grpc.maxReceiveMessageLength", 1024 * 1024 * 16); // 16MB
    this.maxSendMessageLength = env.getPropertyAsNumber("grpc.maxSendMessageLength", 1024 * 1024 * 16);
    this.keepAliveTimeMs = env.getPropertyAsNumber("grpc.keepAliveTimeMs", 30000);
    this.keepAliveTimeoutMs = env.getPropertyAsNumber("grpc.keepAliveTimeoutMs", 10000);
    this.useTls = env.getPropertyAsBoolean("grpc.useTls", false);
  }
}
