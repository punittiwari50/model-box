/**
 * Core Framework & Platform Infrastructure Module.
 * Conforms to:
 * - Directive #3: Common datasource, JPA, specification under core/
 * - Directive #7: Common implementation of cli, web, adapters, observability, resilience, routes, middleware, filters inside core/
 * - Directive #1: Virtual threads & structured concurrency inside core/
 */
export * from "@/core/config/index.js";
export * from "@/core/context/index.js";
export * from "@/core/utils/index.js";
export * from "@/core/concurrency/index.js";
export * from "@/core/datasource/index.js";
export * from "@/core/cli/index.js";
export * from "@/core/web/index.js";
export * from "@/core/adapters/index.js";
export * from "@/core/observability/index.js";
export * from "@/core/resilience/index.js";
