import { ModelConnectorClient } from "@/client/ModelConnectorClient.js";
import type { ClientConfig } from "@/client/ModelConnectorClient.js";
import { ExecutionStrategyType } from "@/domain/constants/index.js";

/**
 * Factory for creating configured instances of ModelConnectorClient.
 * Conforms to STD-COD-005: Factory Pattern.
 */
export class ClientFactory {
  public static create(config?: ClientConfig): ModelConnectorClient {
    return new ModelConnectorClient(config);
  }

  public static createDefault(): ModelConnectorClient {
    return new ModelConnectorClient({
      defaultStrategy: ExecutionStrategyType.API,
    });
  }

  public static createCliClient(): ModelConnectorClient {
    return new ModelConnectorClient({
      defaultStrategy: ExecutionStrategyType.CLI,
    });
  }

  public static createCookieClient(): ModelConnectorClient {
    return new ModelConnectorClient({
      defaultStrategy: ExecutionStrategyType.COOKIE,
    });
  }
}
