import type { IModelRunner } from '@/core/cli/modelRunnerInterface.js';
import { modelRunnerFactory, defaultModelRunner, type IModelRunnerFactory } from '@/core/cli/modelRunnerFactory.js';
import {
  ExecutionStrategyRegistry,
  executionStrategyRegistry,
} from '@/core/cli/executionStrategies.js';
import { ConversationService } from '@/services/conversation/conversationService.js';
import { AuthService } from '@/services/auth/authService.js';
import { JobSearchService } from '@/services/jobSearch/jobSearchService.js';
import {
  ConversationRepository,
  conversationRepo,
} from '@/repositories/conversationRepository.js';
import {
  AuditRepository,
  auditRepo,
} from '@/repositories/auditRepository.js';
import {
  AuthRepository,
  authRepo,
} from '@/repositories/authRepository.js';
import {
  AgentRepository,
  agentRepository,
} from '@/repositories/agentRepository.js';
import {
  AgentService,
  agentService,
} from '@/services/agent/agentService.js';

/**
 * Service Identifier Types for Application Context Service Wiring.
 */
export type ServiceToken<T> = string & { readonly __type?: T };

export const ServiceTokens = {
  ModelRunner: 'ModelRunner' as ServiceToken<IModelRunner>,
  ModelRunnerFactory: 'ModelRunnerFactory' as ServiceToken<IModelRunnerFactory>,
  ConversationService: 'ConversationService' as ServiceToken<ConversationService>,
  AuthService: 'AuthService' as ServiceToken<AuthService>,
  JobSearchService: 'JobSearchService' as ServiceToken<JobSearchService>,
  ExecutionStrategyRegistry: 'ExecutionStrategyRegistry' as ServiceToken<ExecutionStrategyRegistry>,
  ConversationRepository: 'ConversationRepository' as ServiceToken<ConversationRepository>,
  AuditRepository: 'AuditRepository' as ServiceToken<AuditRepository>,
  AuthRepository: 'AuthRepository' as ServiceToken<AuthRepository>,
  AgentRepository: 'AgentRepository' as ServiceToken<AgentRepository>,
  AgentService: 'AgentService' as ServiceToken<AgentService>,
} as const;

/**
 * Enterprise Application Context Contract (Application Context IoC container).
 * Conforms to Directive #2: Keep context/di inside core package.
 */
export interface IApplicationContext {
  register<T>(token: ServiceToken<T>, factory: () => T): void;
  resolve<T>(token: ServiceToken<T>): T;
  getModelRunner(): IModelRunner;
  getModelRunnerFactory(): IModelRunnerFactory;
  getConversationService(): ConversationService;
  getAuthService(): AuthService;
  getJobSearchService(): JobSearchService;
  getExecutionStrategyRegistry(): ExecutionStrategyRegistry;
  getConversationRepository(): ConversationRepository;
  getAuditRepository(): AuditRepository;
  getAuthRepository(): AuthRepository;
  getAgentRepository(): AgentRepository;
  getAgentService(): AgentService;
  reset(): void;
}

/**
 * Application Context & Inversion of Control Container.
 * Manages component lifecycles, lazy initialization, and test mock injection.
 */
export class ApplicationContext implements IApplicationContext {
  private readonly registry = new Map<string, () => any>();
  private readonly instances = new Map<string, any>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register(ServiceTokens.ModelRunner, () => defaultModelRunner);
    this.register(ServiceTokens.ModelRunnerFactory, () => modelRunnerFactory);
    this.register(ServiceTokens.ExecutionStrategyRegistry, () => executionStrategyRegistry);
    this.register(ServiceTokens.ConversationRepository, () => conversationRepo);
    this.register(ServiceTokens.AuditRepository, () => auditRepo);
    this.register(ServiceTokens.AuthRepository, () => authRepo);
    this.register(ServiceTokens.ConversationService, () => new ConversationService());
    this.register(ServiceTokens.AuthService, () => new AuthService());
    this.register(ServiceTokens.JobSearchService, () => new JobSearchService());
    this.register(ServiceTokens.AgentRepository, () => agentRepository);
    this.register(ServiceTokens.AgentService, () => agentService);
  }

  public register<T>(token: ServiceToken<T>, factory: () => T): void {
    this.registry.set(token, factory);
    this.instances.delete(token);
  }

  public resolve<T>(token: ServiceToken<T>): T {
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }
    const factory = this.registry.get(token);
    if (!factory) {
      throw new Error(`[ApplicationContext] Service not registered for token: ${token}`);
    }
    const instance = factory();
    this.instances.set(token, instance);
    return instance;
  }

  public getModelRunner(): IModelRunner {
    return this.resolve(ServiceTokens.ModelRunner);
  }

  public getModelRunnerFactory(): IModelRunnerFactory {
    return this.resolve(ServiceTokens.ModelRunnerFactory);
  }

  public getConversationService(): ConversationService {
    return this.resolve(ServiceTokens.ConversationService);
  }

  public getAuthService(): AuthService {
    return this.resolve(ServiceTokens.AuthService);
  }

  public getJobSearchService(): JobSearchService {
    return this.resolve(ServiceTokens.JobSearchService);
  }

  public getExecutionStrategyRegistry(): ExecutionStrategyRegistry {
    return this.resolve(ServiceTokens.ExecutionStrategyRegistry);
  }

  public getConversationRepository(): ConversationRepository {
    return this.resolve(ServiceTokens.ConversationRepository);
  }

  public getAuditRepository(): AuditRepository {
    return this.resolve(ServiceTokens.AuditRepository);
  }

  public getAuthRepository(): AuthRepository {
    return this.resolve(ServiceTokens.AuthRepository);
  }

  public getAgentRepository(): AgentRepository {
    return this.resolve(ServiceTokens.AgentRepository);
  }

  public getAgentService(): AgentService {
    return this.resolve(ServiceTokens.AgentService);
  }

  public reset(): void {
    this.instances.clear();
    this.registry.clear();
    this.registerDefaults();
  }
}

/**
 * Global singleton ApplicationContext instance.
 */
export const applicationContext: IApplicationContext = new ApplicationContext();

// Backward-compatible alias
export const container = applicationContext;
export const AppContainer = ApplicationContext;
export type IContainer = IApplicationContext;
