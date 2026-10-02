"""PostgreSQL persistence exports."""

from model_connectors.infrastructure.persistence.postgres.postgres_repository import (
    POSTGRES_SCHEMA_DDL,
    PostgresRepository,
)

__all__ = ["PostgresRepository", "POSTGRES_SCHEMA_DDL"]
