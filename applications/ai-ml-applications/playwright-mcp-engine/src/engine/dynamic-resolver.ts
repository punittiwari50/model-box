import type { SelectorDefinition, WorkflowContext } from '@/types/workflow.js';

// ============================================================================
// Dynamic Resolution Strategy Pattern (SOLID: SRP, OCP, LSP, ISP, DIP)
// ============================================================================

export interface IValueResolutionStrategy {
  canResolve(value: unknown): boolean;
  resolve<T>(value: unknown, context: WorkflowContext): T;
}

export class StringResolutionStrategy implements IValueResolutionStrategy {
  canResolve(value: unknown): boolean {
    return typeof value === 'string';
  }

  resolve<T>(value: unknown, context: WorkflowContext): T {
    return DynamicResolver.resolveString(value as string, context) as unknown as T;
  }
}

export class ArrayResolutionStrategy implements IValueResolutionStrategy {
  canResolve(value: unknown): boolean {
    return Array.isArray(value);
  }

  resolve<T>(value: unknown, context: WorkflowContext): T {
    return (value as unknown[]).map((item) => DynamicResolver.resolveValue(item, context)) as unknown as T;
  }
}

export class ObjectResolutionStrategy implements IValueResolutionStrategy {
  canResolve(value: unknown): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  resolve<T>(value: unknown, context: WorkflowContext): T {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = DynamicResolver.resolveValue(v, context);
    }
    return result as T;
  }
}

export class PrimitiveResolutionStrategy implements IValueResolutionStrategy {
  canResolve(_value: unknown): boolean {
    return true;
  }

  resolve<T>(value: unknown, _context: WorkflowContext): T {
    return value as T;
  }
}

// ============================================================================
// Dynamic Expression & Context Path Resolver
// ============================================================================

export class DynamicResolver {
  private static readonly VALUE_STRATEGIES: IValueResolutionStrategy[] = [
    new StringResolutionStrategy(),
    new ArrayResolutionStrategy(),
    new ObjectResolutionStrategy(),
    new PrimitiveResolutionStrategy(),
  ];

  private static readonly BUILTIN_EXPRESSIONS: Readonly<Record<string, () => string>> = {
    'now()': () => new Date().toISOString(),
    'timestamp()': () => String(Date.now()),
    'randomId()': () => Math.random().toString(36).substring(2, 9),
  };

  private static readonly ROOT_RESOLVERS: Readonly<Record<string, (ctx: WorkflowContext) => unknown>> = {
    vars: (ctx) => ctx.variables,
    variables: (ctx) => ctx.variables,
    env: (ctx) => ctx.env,
    extracted: (ctx) => ctx.extracted,
    steps: (ctx) => ctx.stepResults,
  };

  static resolveString(template: string, context: WorkflowContext): string {
    const isEligible = typeof template === 'string' && template.includes('{{');
    const resolutionActions: Record<string, () => string> = {
      false: () => template,
      true: () =>
        template.replace(/\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}/g, (match, expression: string) => {
          const resolved = DynamicResolver.getValueByPath(expression, context);
          const isNil = resolved === undefined || resolved === null;

          const nilResolvers: Record<string, () => string> = {
            true: () => {
              const builtinFn = DynamicResolver.BUILTIN_EXPRESSIONS[expression];
              const builtinActions: Record<string, () => string> = {
                true: () => builtinFn!(),
                false: () => match,
              };
              return (builtinActions[String(Boolean(builtinFn))] ?? builtinActions.false)();
            },
            false: () => (typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved)),
          };

          return (nilResolvers[String(isNil)] ?? nilResolvers.false)();
        }),
    };

    return (resolutionActions[String(isEligible)] ?? resolutionActions.false)();
  }

  static resolveValue<T>(value: T, context: WorkflowContext): T {
    const strategy = this.VALUE_STRATEGIES.find((s) => s.canResolve(value)) ?? new PrimitiveResolutionStrategy();
    return strategy.resolve<T>(value, context);
  }

  static resolveSelectors(
    selectorDef: SelectorDefinition | undefined,
    context: WorkflowContext
  ): string[] {
    const hasDef = Boolean(selectorDef);
    const selectorResolvers: Record<string, () => string[]> = {
      false: () => [],
      true: () => {
        const isString = typeof selectorDef === 'string';
        const isArray = Array.isArray(selectorDef);
        const isObject = typeof selectorDef === 'object' && 'primary' in (selectorDef as object);

        const typeCandidateResolvers: Record<string, () => string[]> = {
          string: () => [selectorDef as string],
          array: () => selectorDef as string[],
          object: () => [
            (selectorDef as { primary: string }).primary,
            ...((selectorDef as { fallbacks?: string[] }).fallbacks || []),
          ],
          default: () => [],
        };

        const resolvedKey = isString ? 'string' : isArray ? 'array' : isObject ? 'object' : 'default';
        const candidates = typeCandidateResolvers[resolvedKey]();

        return candidates
          .map((sel) => DynamicResolver.resolveString(sel, context).trim())
          .filter((sel) => sel.length > 0);
      },
    };

    return (selectorResolvers[String(hasDef)] ?? selectorResolvers.false)();
  }

  private static getValueByPath(path: string, context: WorkflowContext): unknown {
    const parts = path.split('.');
    const rootKey = parts[0];

    const resolver = DynamicResolver.ROOT_RESOLVERS[rootKey];
    const hasExplicitResolver = Boolean(resolver);

    const rootResolutionActions: Record<string, () => unknown> = {
      true: () => resolver!(context),
      false: () => {
        const inVars = Boolean(context.variables && rootKey in context.variables);
        const inExtracted = Boolean(context.extracted && rootKey in context.extracted);

        const fallbackActions: Record<string, () => unknown> = {
          vars: () => {
            parts.unshift('variables');
            return context.variables;
          },
          extracted: () => {
            parts.unshift('extracted');
            return context.extracted;
          },
          none: () => undefined,
        };

        const fallbackKey = inVars ? 'vars' : inExtracted ? 'extracted' : 'none';
        return fallbackActions[fallbackKey]();
      },
    };

    let current = (rootResolutionActions[String(hasExplicitResolver)] ?? rootResolutionActions.false)();

    for (let i = 1; i < parts.length; i++) {
      const isInvalidContainer = current === null || current === undefined || typeof current !== 'object';
      const containerActions: Record<string, () => unknown> = {
        true: () => undefined,
        false: () => (current as Record<string, unknown>)[parts[i]],
      };
      current = (containerActions[String(isInvalidContainer)] ?? containerActions.false)();
    }

    return current;
  }
}
