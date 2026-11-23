# ModelConnector Core Module (`@model-box/model-connector-core`)

The Enterprise Core Foundation module providing cross-cutting infrastructure, utilities, resilience patterns, connection pooling, Spring-style Environment abstraction, and centralized configurations across all platform modules.

## Architecture

- **`constants/`**: Model constants, system headers, environment profile definitions.
- **`utils/`**: Exclusive encapsulated gateway for `process.env`, `process.*`, argument parsing, file handling, concurrency, and cryptographic functions.
- **`config/`**: Spring-style `Environment` interface with relaxed binding, plus protocol configurations (REST, gRPC, WebSocket, Security).
- **`resilience/`**: Resilience4j-inspired fault-tolerance engine (Circuit Breaker, Rate Limiter, Retry Policy, Bulkhead, Composable Pipeline).
- **`pool/`**: Generic enterprise object & connection pooling with timeouts and queue governance.
- **`logging/`**: Structured JSON & ANSI console logging with correlation ID propagation.
