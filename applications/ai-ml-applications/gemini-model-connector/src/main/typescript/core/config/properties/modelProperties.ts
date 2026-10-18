import type { Environment } from "@/core/config/environment.js";
import {
  ModelFamily,
  SubscriptionPolicyConstant,
} from "@/domain/constants/index.js";

export interface ModelHyperparameters {
  readonly temperature: number;
  readonly topP: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly allowMockFallback: boolean;
  readonly fallbackThresholdPercentage: number;
}

export const DEFAULT_HYPERPARAMETERS: ModelHyperparameters = Object.freeze({
  temperature: 0.7,
  topP: 0.95,
  maxOutputTokens: 8192,
  timeoutMs: 120000,
  allowMockFallback: true,
  fallbackThresholdPercentage: 90,
});

export function resolveHyperparameters(
  subscriptionParams?: Partial<ModelHyperparameters>,
  dbOverrides?: Partial<ModelHyperparameters>,
  requestOverrides?: Partial<ModelHyperparameters>,
): ModelHyperparameters {
  return Object.freeze({
    temperature:
      requestOverrides?.temperature ??
      dbOverrides?.temperature ??
      subscriptionParams?.temperature ??
      DEFAULT_HYPERPARAMETERS.temperature,
    topP:
      requestOverrides?.topP ??
      dbOverrides?.topP ??
      subscriptionParams?.topP ??
      DEFAULT_HYPERPARAMETERS.topP,
    maxOutputTokens:
      requestOverrides?.maxOutputTokens ??
      dbOverrides?.maxOutputTokens ??
      subscriptionParams?.maxOutputTokens ??
      DEFAULT_HYPERPARAMETERS.maxOutputTokens,
    timeoutMs:
      requestOverrides?.timeoutMs ??
      dbOverrides?.timeoutMs ??
      subscriptionParams?.timeoutMs ??
      DEFAULT_HYPERPARAMETERS.timeoutMs,
    allowMockFallback:
      requestOverrides?.allowMockFallback ??
      dbOverrides?.allowMockFallback ??
      subscriptionParams?.allowMockFallback ??
      DEFAULT_HYPERPARAMETERS.allowMockFallback,
    fallbackThresholdPercentage:
      requestOverrides?.fallbackThresholdPercentage ??
      dbOverrides?.fallbackThresholdPercentage ??
      subscriptionParams?.fallbackThresholdPercentage ??
      DEFAULT_HYPERPARAMETERS.fallbackThresholdPercentage,
  });
}

export interface ModelSubscriptionConfig {
  readonly tier: "paid" | "freeware";
  readonly accountEmail: string;
  readonly accountName: string;
  readonly hyperparameters?: Partial<ModelHyperparameters>;
}

export interface ModelSubscriptionsGroup {
  readonly paid: readonly ModelSubscriptionConfig[];
  readonly freeware: readonly ModelSubscriptionConfig[];
}

export interface ModelProviderConfig {
  readonly cli?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly apiBaseUrl?: string;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly accountEmail?: string;
  readonly accountName?: string;
  readonly tier?: "paid" | "freeware";
  readonly subscriptions?: ModelSubscriptionsGroup;
  readonly [key: string]: any;
}

/**
 * Strongly-typed generic configuration properties for model execution.
 * Eliminates model-specific properties and method names in favor of polymorphic model resolution.
 * Conforms to STD-COD-001, STD-COD-002, STD-COD-005.
 */
export class ModelProperties {
  public readonly defaultModel: string;
  public readonly fallbackModel: string;
  public readonly fallbackThresholdPercentage: number;
  public readonly cliCommand: string;
  public readonly cliTimeoutMs: number;
  public readonly executionMode: "auto" | "api" | "cli" | "mock";
  public readonly allowMockFallback: boolean;
  public readonly subscriptionPolicy: string;
  private readonly providers: Map<string, ModelProviderConfig> = new Map();

  constructor(env: Environment) {
    this.defaultModel = env.getProperty(
      "model.default",
      env.getProperty(
        "model.default_model",
        env.getProperty("GEMINI_DEFAULT_MODEL", "gemini-3.8-flash"),
      ),
    );
    this.fallbackModel = env.getProperty(
      "model.fallback",
      env.getProperty("FALLBACK_MODEL", "tinyllama"),
    );
    this.fallbackThresholdPercentage = env.getPropertyAsNumber(
      "model.fallbackThresholdPercentage",
      env.getPropertyAsNumber("FALLBACK_THRESHOLD_PERCENTAGE", 90),
    );
    this.cliCommand = env.getProperty(
      "model.cliCommand",
      env.getProperty("GEMINI_CLI_COMMAND", "gemini"),
    );
    this.cliTimeoutMs = env.getPropertyAsNumber(
      "model.cliTimeoutMs",
      env.getPropertyAsNumber("model.timeoutMs", 120000),
    );
    const mode = env.getProperty(
      "model.executionMode",
      env.getProperty("GEMINI_EXECUTION_MODE", "auto"),
    );
    this.executionMode = ["auto", "api", "cli", "mock"].includes(mode)
      ? (mode as any)
      : "auto";
    this.allowMockFallback = env.getPropertyAsBoolean(
      "model.allowMockFallback",
      env.getPropertyAsBoolean("ALLOW_MOCK_FALLBACK", false),
    );
    this.subscriptionPolicy = env.getProperty(
      "models.subscription.policy",
      env.getProperty(
        "SUBSCRIPTION_POLICY",
        SubscriptionPolicyConstant.PAID_FIRST,
      ),
    );

    this.initializeProviders(env);
  }

  private initializeProviders(env: Environment): void {
    const knownFamilies = [
      ModelFamily.GEMINI,
      ModelFamily.OLLAMA,
      ModelFamily.CLAUDE,
      ModelFamily.CODEX,
      ModelFamily.CURSOR,
      ModelFamily.COPILOT,
      ModelFamily.GROK,
    ];
    for (const family of knownFamilies) {
      this.providers.set(family, this.buildProviderConfig(env, family));
    }
  }

  private buildProviderConfig(
    env: Environment,
    family: string,
  ): ModelProviderConfig {
    const upper = family.toUpperCase();
    const cli = env.getProperty(
      `${upper}_CLI_COMMAND`,
      env.getProperty(
        `models.${family}.cli`,
        env.getProperty(`model.${family}.cli`, family),
      ),
    );
    const model = env.getProperty(
      `${upper}_DEFAULT_MODEL`,
      env.getProperty(
        `models.${family}.model`,
        env.getProperty(`model.${family}.model`, ""),
      ),
    );
    const apiKey =
      env.getProperty(`models.${family}.apiKey`) ||
      env.getProperty(`model.${family}.apiKey`) ||
      env.getProperty("model.apiKey") ||
      env.getProperty(`${upper}_API_KEY`);
    const apiBaseUrl = env.getProperty(
      `${upper}_BASE_URL`,
      env.getProperty(
        `models.${family}.apiBaseUrl`,
        env.getProperty(`model.${family}.apiBaseUrl`, ""),
      ),
    );
    const maxTokens = env.getPropertyAsNumber(
      `models.${family}.maxTokens`,
      env.getPropertyAsNumber(`model.${family}.maxTokens`, 1000000),
    );
    const timeoutMs = env.getPropertyAsNumber(
      `models.${family}.timeoutMs`,
      env.getPropertyAsNumber(`model.${family}.timeoutMs`, this.cliTimeoutMs),
    );
    const accountEmail = env.getProperty(
      `${upper}_ACCOUNT_EMAIL`,
      env.getProperty(
        `models.${family}.accountEmail`,
        env.getProperty(
          `model.${family}.accountEmail`,
          env.getProperty(
            "auth.defaultAccount.email",
            "default@modelbox.local",
          ),
        ),
      ),
    );
    const accountName = env.getProperty(
      `${upper}_ACCOUNT_NAME`,
      env.getProperty(
        `models.${family}.accountName`,
        env.getProperty(
          `model.${family}.accountName`,
          env.getProperty("auth.defaultAccount.name", "Default Account"),
        ),
      ),
    );
    const rawTier = env.getProperty(
      `${upper}_TIER`,
      env.getProperty(
        `models.${family}.tier`,
        env.getProperty(
          `model.${family}.tier`,
          family === ModelFamily.OLLAMA ? "freeware" : "paid",
        ),
      ),
    );
    const tier: "paid" | "freeware" =
      rawTier.toLowerCase() === "freeware" ? "freeware" : "paid";

    const paidList = this.loadSubscriptionList(
      env,
      family,
      "paid",
      accountEmail,
      `${accountName} (Paid)`,
    );
    const freeList = this.loadSubscriptionList(
      env,
      family,
      "freeware",
      env.getProperty("auth.defaultAccount.email", "free@modelbox.local"),
      `${accountName} (Freeware)`,
    );

    return Object.freeze({
      cli,
      model,
      apiKey,
      apiBaseUrl,
      maxTokens,
      timeoutMs,
      accountEmail,
      accountName,
      tier,
      subscriptions: Object.freeze({ paid: paidList, freeware: freeList }),
    });
  }

  private loadSubscriptionList(
    env: Environment,
    family: string,
    tier: "paid" | "freeware",
    defaultEmail: string,
    defaultName: string,
  ): readonly ModelSubscriptionConfig[] {
    const list: ModelSubscriptionConfig[] = [];
    let idx = 0;
    while (true) {
      const email = env.getProperty(
        `models.${family}.subscriptions.${tier}.${idx}.accountEmail`,
      );
      if (!email) break;
      const name = env.getProperty(
        `models.${family}.subscriptions.${tier}.${idx}.accountName`,
        defaultName,
      );
      const hyperparams = this.extractHyperparameters(
        env,
        `models.${family}.subscriptions.${tier}.${idx}`,
      );
      list.push(
        Object.freeze({
          tier,
          accountEmail: email,
          accountName: name,
          hyperparameters: hyperparams,
        }),
      );
      idx++;
    }

    if (list.length === 0) {
      const singleEmail = env.getProperty(
        `models.${family}.subscriptions.${tier}.accountEmail`,
        defaultEmail,
      );
      const singleName = env.getProperty(
        `models.${family}.subscriptions.${tier}.accountName`,
        defaultName,
      );
      const hyperparams = this.extractHyperparameters(
        env,
        `models.${family}.subscriptions.${tier}`,
      );
      list.push(
        Object.freeze({
          tier,
          accountEmail: singleEmail,
          accountName: singleName,
          hyperparameters: hyperparams,
        }),
      );
    }
    return Object.freeze(list);
  }

  private extractHyperparameters(
    env: Environment,
    prefix: string,
  ): Partial<ModelHyperparameters> | undefined {
    const params: Partial<ModelHyperparameters> = {};
    if (env.containsProperty(`${prefix}.temperature`)) {
      (params as any).temperature = env.getPropertyAsNumber(
        `${prefix}.temperature`,
      );
    }
    if (env.containsProperty(`${prefix}.topP`)) {
      (params as any).topP = env.getPropertyAsNumber(`${prefix}.topP`);
    }
    if (env.containsProperty(`${prefix}.maxOutputTokens`)) {
      (params as any).maxOutputTokens = env.getPropertyAsNumber(
        `${prefix}.maxOutputTokens`,
      );
    }
    if (env.containsProperty(`${prefix}.timeoutMs`)) {
      (params as any).timeoutMs = env.getPropertyAsNumber(
        `${prefix}.timeoutMs`,
      );
    }
    if (env.containsProperty(`${prefix}.allowMockFallback`)) {
      (params as any).allowMockFallback = env.getPropertyAsBoolean(
        `${prefix}.allowMockFallback`,
      );
    }
    if (env.containsProperty(`${prefix}.fallbackThresholdPercentage`)) {
      (params as any).fallbackThresholdPercentage = env.getPropertyAsNumber(
        `${prefix}.fallbackThresholdPercentage`,
      );
    }
    return Object.keys(params).length > 0 ? Object.freeze(params) : undefined;
  }

  public getSubscriptions(
    familyOrModel: string,
    tier: "paid" | "freeware",
  ): readonly ModelSubscriptionConfig[] {
    const conf = this.getModelConfig(familyOrModel);
    return (
      conf.subscriptions?.[tier] ||
      Object.freeze([this.getSubscription(familyOrModel, tier)])
    );
  }

  public getSubscription(
    familyOrModel: string,
    tier: "paid" | "freeware",
    index = 0,
  ): ModelSubscriptionConfig {
    const conf = this.getModelConfig(familyOrModel);
    const list = conf.subscriptions?.[tier];
    if (list && list[index]) {
      return list[index];
    }
    if (list && list.length > 0) {
      return list[0];
    }
    return Object.freeze({
      tier,
      accountEmail: conf.accountEmail || "default@modelbox.local",
      accountName: conf.accountName || "Default Account",
    });
  }

  public getModelSubscriptions(
    familyOrModel: string,
  ): readonly ModelSubscriptionConfig[] {
    const conf = this.getModelConfig(familyOrModel);
    if (conf.subscriptions) {
      return Object.freeze([
        ...conf.subscriptions.paid,
        ...conf.subscriptions.freeware,
      ]);
    }
    return Object.freeze([
      this.getSubscription(familyOrModel, this.getModelTier(familyOrModel)),
    ]);
  }

  public getModelConfig(familyOrModel: string): ModelProviderConfig {
    const key = this.resolveFamilyKey(familyOrModel);
    return this.providers.get(key) || Object.freeze({});
  }

  public getApiKey(familyOrModel: string): string | undefined {
    return this.getModelConfig(familyOrModel).apiKey;
  }

  public getApiBaseUrl(familyOrModel: string): string | undefined {
    return this.getModelConfig(familyOrModel).apiBaseUrl;
  }

  public getCliCommand(familyOrModel: string): string | undefined {
    return this.getModelConfig(familyOrModel).cli;
  }

  public getMaxTokens(familyOrModel: string): number {
    return this.getModelConfig(familyOrModel).maxTokens || 1000000;
  }

  public getAccountEmail(familyOrModel: string): string {
    return (
      this.getModelConfig(familyOrModel).accountEmail ||
      "default@modelbox.local"
    );
  }

  public getAccountName(familyOrModel: string): string {
    return this.getModelConfig(familyOrModel).accountName || "Default Account";
  }

  public getModelTier(familyOrModel: string): "paid" | "freeware" {
    const conf = this.getModelConfig(familyOrModel);
    if (conf.tier === "paid" || conf.tier === "freeware") {
      return conf.tier;
    }
    return this.isFallbackModel(familyOrModel) ? "freeware" : "paid";
  }

  public isFallbackModel(familyOrModel: string): boolean {
    const key = this.resolveFamilyKey(familyOrModel);
    return (
      key === ModelFamily.OLLAMA ||
      (familyOrModel || "")
        .toLowerCase()
        .includes(this.fallbackModel.toLowerCase())
    );
  }

  public resolveFamilyKey(familyOrModel: string): string {
    const lower = (familyOrModel || "").toLowerCase();
    if (
      lower.includes("ollama") ||
      lower.includes("llama") ||
      lower.includes("qwen") ||
      lower.includes("phi") ||
      lower.includes("gemma") ||
      lower.includes("deepseek") ||
      lower.includes("nemotron") ||
      lower.includes("minicpm")
    ) {
      return ModelFamily.OLLAMA;
    }
    if (lower.includes(ModelFamily.GEMINI)) return ModelFamily.GEMINI;
    if (lower.includes(ModelFamily.CLAUDE) || lower.includes("anthropic"))
      return ModelFamily.CLAUDE;
    if (
      lower.includes("gpt") ||
      lower.includes(ModelFamily.CODEX) ||
      lower.includes("openai")
    )
      return ModelFamily.CODEX;
    if (lower.includes(ModelFamily.CURSOR)) return ModelFamily.CURSOR;
    if (lower.includes(ModelFamily.COPILOT)) return ModelFamily.COPILOT;
    if (lower.includes(ModelFamily.GROK) || lower.includes("xai"))
      return ModelFamily.GROK;
    return lower;
  }
}
