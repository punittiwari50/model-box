/**
 * JPA-Style Specification Pattern for Dynamic Query Composition.
 * Conforms to:
 * - Directive #2 & #3: Core DataSource & Specification Pattern
 * - Directive #8: OOP style with Design Patterns
 */

export interface Predicate {
  readonly sql: string;
  readonly params: readonly (string | number | boolean | null)[];
}

export interface Specification<T> {
  toPredicate(): Predicate;
  and(other: Specification<T>): Specification<T>;
  or(other: Specification<T>): Specification<T>;
  not(): Specification<T>;
}

export abstract class BaseSpecification<T> implements Specification<T> {
  public abstract toPredicate(): Predicate;

  public and(other: Specification<T>): Specification<T> {
    return new AndSpecification<T>(this, other);
  }

  public or(other: Specification<T>): Specification<T> {
    return new OrSpecification<T>(this, other);
  }

  public not(): Specification<T> {
    return new NotSpecification<T>(this);
  }
}

class AndSpecification<T> extends BaseSpecification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>
  ) {
    super();
  }

  public toPredicate(): Predicate {
    const leftPred = this.left.toPredicate();
    const rightPred = this.right.toPredicate();

    if (!leftPred.sql && !rightPred.sql) {
      return { sql: '', params: [] };
    }
    if (!leftPred.sql) return rightPred;
    if (!rightPred.sql) return leftPred;

    return {
      sql: `(${leftPred.sql} AND ${rightPred.sql})`,
      params: [...leftPred.params, ...rightPred.params],
    };
  }
}

class OrSpecification<T> extends BaseSpecification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>
  ) {
    super();
  }

  public toPredicate(): Predicate {
    const leftPred = this.left.toPredicate();
    const rightPred = this.right.toPredicate();

    if (!leftPred.sql && !rightPred.sql) {
      return { sql: '', params: [] };
    }
    if (!leftPred.sql) return rightPred;
    if (!rightPred.sql) return leftPred;

    return {
      sql: `(${leftPred.sql} OR ${rightPred.sql})`,
      params: [...leftPred.params, ...rightPred.params],
    };
  }
}

class NotSpecification<T> extends BaseSpecification<T> {
  constructor(private readonly spec: Specification<T>) {
    super();
  }

  public toPredicate(): Predicate {
    const pred = this.spec.toPredicate();
    if (!pred.sql) {
      return { sql: '', params: [] };
    }
    return {
      sql: `(NOT (${pred.sql}))`,
      params: pred.params,
    };
  }
}

export class OptimisticLockException extends Error {
  public readonly entityId: string;
  public readonly expectedVersion: number;

  constructor(entityName: string, entityId: string, expectedVersion: number) {
    super(
      `Optimistic lock failure on ${entityName} '${entityId}' (expected version: ${expectedVersion}). The record was modified concurrently by another process.`
    );
    this.name = 'OptimisticLockException';
    this.entityId = entityId;
    this.expectedVersion = expectedVersion;
  }
}

import type { ConversationEntity } from '@/domain/entities/conversation.entity.js';

export class ConversationSpecifications {
  public static hasId(id: string): Specification<ConversationEntity> {
    return new (class extends BaseSpecification<ConversationEntity> {
      public toPredicate(): Predicate {
        return { sql: 'ID = ?', params: [id] };
      }
    })();
  }

  public static hasModel(model: string): Specification<ConversationEntity> {
    return new (class extends BaseSpecification<ConversationEntity> {
      public toPredicate(): Predicate {
        return { sql: 'MODEL = ?', params: [model] };
      }
    })();
  }

  public static titleContains(keyword: string): Specification<ConversationEntity> {
    return new (class extends BaseSpecification<ConversationEntity> {
      public toPredicate(): Predicate {
        return { sql: 'TITLE LIKE ?', params: [`%${keyword}%`] };
      }
    })();
  }

  public static hasTag(tag: string): Specification<ConversationEntity> {
    return new (class extends BaseSpecification<ConversationEntity> {
      public toPredicate(): Predicate {
        return { sql: 'TAGS LIKE ?', params: [`%"${tag}"%`] };
      }
    })();
  }

  public static all(): Specification<ConversationEntity> {
    return new (class extends BaseSpecification<ConversationEntity> {
      public toPredicate(): Predicate {
        return { sql: '1=1', params: [] };
      }
    })();
  }
}
