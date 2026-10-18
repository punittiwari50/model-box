import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface IModulePathResolver {
  getDirname(importMetaUrl: string): string;
  getFilename(importMetaUrl: string): string;
  resolveFromModule(importMetaUrl: string, ...segments: string[]): string;
  getDataDir(): string;
  getArtifactsDir(): string;
  getAgentsDir(): string;
  resolveDataPath(...segments: string[]): string;
  resolveArtifactsPath(...segments: string[]): string;
  resolveAgentsPath(...segments: string[]): string;
}

/**
 * OOP Module Path Resolver Service.
 * Encapsulates ESM URL-to-path resolution and relative path mechanics (STD-COD-007).
 */
export class ModulePathResolver implements IModulePathResolver {
  public getDirname(importMetaUrl: string): string {
    return path.dirname(fileURLToPath(importMetaUrl));
  }

  public getFilename(importMetaUrl: string): string {
    return fileURLToPath(importMetaUrl);
  }

  public resolveFromModule(importMetaUrl: string, ...segments: string[]): string {
    return path.resolve(this.getDirname(importMetaUrl), ...segments);
  }

  public getDataDir(): string {
    return path.resolve(projectRoot, 'config', 'data');
  }

  public getArtifactsDir(): string {
    return path.resolve(projectRoot, 'config', 'artifacts');
  }

  public getAgentsDir(): string {
    return path.resolve(projectRoot, 'AGENTS');
  }

  public resolveDataPath(...segments: string[]): string {
    return path.resolve(this.getDataDir(), ...segments);
  }

  public resolveArtifactsPath(...segments: string[]): string {
    return path.resolve(this.getArtifactsDir(), ...segments);
  }

  public resolveAgentsPath(...segments: string[]): string {
    return path.resolve(this.getAgentsDir(), ...segments);
  }
}

export const modulePathResolver = new ModulePathResolver();
export const pathResolver = modulePathResolver;
export type IPathResolver = IModulePathResolver;

// Backward compatibility helper functions delegating to the OOP service
export function getDirname(importMetaUrl: string): string {
  return modulePathResolver.getDirname(importMetaUrl);
}

export function getFilename(importMetaUrl: string): string {
  return modulePathResolver.getFilename(importMetaUrl);
}

export function resolveFromModule(importMetaUrl: string, ...segments: string[]): string {
  return modulePathResolver.resolveFromModule(importMetaUrl, ...segments);
}

export function resolveModulePath(importMetaUrl: string, ...segments: string[]): string {
  return modulePathResolver.resolveFromModule(importMetaUrl, ...segments);
}

export function resolveDataPath(...segments: string[]): string {
  return modulePathResolver.resolveDataPath(...segments);
}

export function resolveArtifactsPath(...segments: string[]): string {
  return modulePathResolver.resolveArtifactsPath(...segments);
}

function findProjectRoot(fromDir: string): string {
  let curr = fromDir;
  for (let i = 0; i < 7; i++) {
    if (
      fs.existsSync(path.join(curr, 'package.json')) ||
      fs.existsSync(path.join(curr, 'config', 'env', 'application.yml'))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(fromDir, '../../../../../');
}

/**
 * Root directory path of the gemini-model-connector project.
 * Automatically resolved from runtime or development directory.
 */
export const projectRoot = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
