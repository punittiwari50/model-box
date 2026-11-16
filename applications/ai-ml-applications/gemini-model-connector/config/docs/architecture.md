# Gemini Model Connector Documentation & Architecture Specifications

## 1. Directory Structure Organization
All configuration, scripts, persistence data, and artifacts reside under `config/`:
- `config/docker/`: Dockerfiles, compose manifests, and container entrypoints.
- `config/env/`: Multi-tier environment profiles (`application.yml`, `.env.local`, `application-postgres-test.yml`).
- `config/scripts/`: Categorized lifecycle and database scripts:
  - `config/scripts/build/`: Hermetic container build automation (`build.ps1`, `build.sh`).
  - `config/scripts/deploy/`: Service deployment and healthcheck orchestration (`deploy.ps1`, `deploy.sh`).
  - `config/scripts/verification/`: In-container integration verification tools (`verify.ps1`, `verify.sh`, `verify_server.py`).
  - `config/scripts/sql/`: Capitalized database DDL schema and seed DML scripts (`schema-ddl.sql`, `seed-dml.sql`).
- `config/data/`: Default SQLite database persistence mount (`model_connector.db`).
- `config/artifacts/`: Generated Job Search Markdown artifacts and analysis logs.
- `config/docs/`: Project documentation, architectural decisions, and security compliance matrices.

## 2. Layered Architecture
- `src/domain/`: Pure domain types, database entities, and request/response DTOs.
- `src/infrastructure/`: Persistence, HTTP clients, Resilience4j fault tolerance suite, and OAuth provider adapters.
- `src/application/`: Transactional business orchestration (`ConversationService`, `AuthService`, `JobSearchService`).
- `src/presentation/`: REST API controllers, routing, security middleware, and web UI.
- `tests/`: Pure test suites separated from production `src/` (`unit`, `integration`, `concurrent`, `performance`).

## 3. Security & Anti-PII Governance
- Zero secrets or tokens in query parameters or URL path variables.
- Request validation filter sanitizes UUIDs, payloads, and strings before hitting service logic.
- Idempotency filter protects against duplicate mutations via `Idempotency-Key` or SHA-256 payload hash caching.
- Sanitizing error filter strips stack traces, SQL syntax, and internal file paths.
- Resilient OAuth providers load credentials dynamically from `application.yml` or database.
