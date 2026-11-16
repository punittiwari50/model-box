/**
 * Spring-inspired PropertySource abstraction.
 * Represents a named source of key/value properties.
 */
export abstract class PropertySource<T = unknown> {
  protected constructor(
    protected readonly name: string,
    protected readonly source: T
  ) {}

  public getName(): string {
    return this.name;
  }

  public getSource(): T {
    return this.source;
  }

  public abstract getProperty(name: string): string | undefined;
  public abstract containsProperty(name: string): boolean;
  public abstract getPropertyNames(): readonly string[];
}

export class MapPropertySource extends PropertySource<Readonly<Record<string, string | undefined>>> {
  constructor(name: string, source: Record<string, string | undefined>) {
    super(name, Object.freeze({ ...source }));
  }

  public getProperty(name: string): string | undefined {
    return this.source[name];
  }

  public containsProperty(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.source, name) && this.source[name] !== undefined;
  }

  public getPropertyNames(): readonly string[] {
    return Object.freeze(Object.keys(this.source));
  }
}

export class CompositePropertySource {
  private readonly propertySources: PropertySource[] = [];

  public addFirst(propertySource: PropertySource): void {
    this.propertySources.unshift(propertySource);
  }

  public addLast(propertySource: PropertySource): void {
    this.propertySources.push(propertySource);
  }

  public getProperty(name: string): string | undefined {
    for (const source of this.propertySources) {
      if (source.containsProperty(name)) {
        return source.getProperty(name);
      }
    }
    return undefined;
  }

  public containsProperty(name: string): boolean {
    return this.propertySources.some((s) => s.containsProperty(name));
  }

  public getAllProperties(): Readonly<Record<string, string | undefined>> {
    const combined: Record<string, string | undefined> = {};
    // Iterate in reverse so higher priority (earlier in list) overwrites lower
    for (let i = this.propertySources.length - 1; i >= 0; i--) {
      const source = this.propertySources[i];
      for (const key of source.getPropertyNames()) {
        combined[key] = source.getProperty(key);
      }
    }
    return Object.freeze(combined);
  }
}
