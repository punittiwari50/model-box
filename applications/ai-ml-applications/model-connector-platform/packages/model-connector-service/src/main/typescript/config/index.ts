import { z } from "zod";
import { ServiceConstant, ConfigProperty, EnvironmentProfile } from "@/constants/index";
import { environment } from "@model-box/model-connector-core";

const isBuilderEnv =
  environment.getPropertyAsBoolean(ConfigProperty.IS_BUILDER, false) ||
  environment.getProperty(ConfigProperty.CONTAINER_ROLE, "") === ConfigProperty.BUILDER_ROLE ||
  environment.getProperty(ConfigProperty.NODE_ENV, EnvironmentProfile.DEVELOPMENT) === EnvironmentProfile.TEST;

const defaultMock = isBuilderEnv;

const configSchema = z.object({
  port: z.coerce.number().default(ServiceConstant.DEFAULT_PORT),
  host: z.string().default(ServiceConstant.DEFAULT_HOST),
  nodeEnv: z
    .enum([
      EnvironmentProfile.DEVELOPMENT,
      EnvironmentProfile.PRODUCTION,
      EnvironmentProfile.TEST,
    ])
    .default(EnvironmentProfile.DEVELOPMENT),
  upstreamConnectorUrl: z.string().default(ServiceConstant.DEFAULT_UPSTREAM_URL),
  geminiConnectorUrl: z.string().default(ServiceConstant.DEFAULT_UPSTREAM_URL),
  defaultModel: z.string().default(ServiceConstant.DEFAULT_MODEL),
  corsOrigins: z.string().default(ServiceConstant.DEFAULT_CORS_ORIGINS),
  logLevel: z.string().default(ServiceConstant.DEFAULT_LOG_LEVEL),
  enableSimulationFallback: z.coerce.boolean().default(defaultMock),
  fallbackProvider: z.string().default(ServiceConstant.DEFAULT_FALLBACK_PROVIDER),
  fallbackModel: z.string().default(ServiceConstant.DEFAULT_FALLBACK_MODEL),
  fallbackBaseUrl: z.string().default(ServiceConstant.DEFAULT_FALLBACK_BASE_URL),
  fallbackCliCommand: z.string().default(ServiceConstant.DEFAULT_FALLBACK_CLI_COMMAND),
});

const upstreamUrl =
  environment.getProperty("upstream.connector.url") ||
  environment.getProperty("gemini.connector.url") ||
  ServiceConstant.DEFAULT_UPSTREAM_URL;

const parsed = configSchema.safeParse({
  port: environment.getProperty("port", String(ServiceConstant.DEFAULT_PORT)),
  host: environment.getProperty("host", ServiceConstant.DEFAULT_HOST),
  nodeEnv: environment.getProperty(ConfigProperty.NODE_ENV, EnvironmentProfile.DEVELOPMENT),
  upstreamConnectorUrl: upstreamUrl,
  geminiConnectorUrl: upstreamUrl,
  defaultModel: environment.getProperty("default.model", environment.getProperty("model.default", ServiceConstant.DEFAULT_MODEL)),
  corsOrigins: environment.getProperty("cors.origins", ServiceConstant.DEFAULT_CORS_ORIGINS),
  logLevel: environment.getProperty("log.level", ServiceConstant.DEFAULT_LOG_LEVEL),
  enableSimulationFallback: environment.getPropertyAsBoolean("enable.simulation.fallback", defaultMock),
  fallbackProvider: environment.getProperty("fallback.provider", ServiceConstant.DEFAULT_FALLBACK_PROVIDER),
  fallbackModel: environment.getProperty("fallback.model", environment.getProperty("fallback.default.model", ServiceConstant.DEFAULT_FALLBACK_MODEL)),
  fallbackBaseUrl: environment.getProperty("fallback.base.url", environment.getProperty("fallback.endpoint", ServiceConstant.DEFAULT_FALLBACK_BASE_URL)),
  fallbackCliCommand: environment.getProperty("fallback.cli.command", ServiceConstant.DEFAULT_FALLBACK_CLI_COMMAND),
});

if (!parsed.success) {
  throw new Error(`Configuration validation failed: ${JSON.stringify(parsed.error.format())}`);
}

export const appConfig = Object.freeze(parsed.data);
export type AppConfig = typeof appConfig;
