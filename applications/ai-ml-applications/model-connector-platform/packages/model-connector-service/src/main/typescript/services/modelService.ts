import { ClientFactory, type ModelConnectorClient, type ModelDescriptor } from "@model-box/model-connector-client";
import { appConfig } from "@/config/index";

export class ModelService {
  private readonly client: ModelConnectorClient;

  constructor(client?: ModelConnectorClient) {
    this.client =
      client ||
      ClientFactory.create({
        upstreamUrl: appConfig.upstreamConnectorUrl || appConfig.geminiConnectorUrl,
        defaultModel: appConfig.defaultModel,
      });
  }

  public async getModels(correlationId?: string): Promise<readonly ModelDescriptor[]> {
    return this.client.getModels(correlationId);
  }

  public async getModelById(id: string, correlationId?: string): Promise<ModelDescriptor | undefined> {
    const models = await this.client.getModels(correlationId);
    return models.find((m) => m.id.toLowerCase() === id.toLowerCase());
  }

  public getClient(): ModelConnectorClient {
    return this.client;
  }
}

export const modelService = new ModelService();
