"""Manage Connection Configuration and Health Probing Use Case adhering to STD-COD-007.2."""

from typing import Any, Sequence

from model_connectors.application.dto.inference_dto import ConnectionCreateDTO
from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.enums import StorageBackend
from model_connectors.domain.models.inference import HealthStatus
from model_connectors.domain.ports.repositories import IConnectionConfigRepository
from model_connectors.domain.results.result import Failure, Result, Success
from model_connectors.infrastructure.connectors.connector_factory import (
    ModelConnectorFactory,
)


from model_connectors.infrastructure.connectors.endpoint_resolver import (
    resolve_endpoint,
)


class ManageConnectionUseCase:
    """Registers connection profiles, queries configurations, and audits health across protocols."""

    def __init__(
        self,
        repositories: dict[StorageBackend, IConnectionConfigRepository],
        default_backend: StorageBackend,
        connector_factory: ModelConnectorFactory,
    ) -> None:
        self._repos = repositories
        self._default_backend = default_backend
        self._factory = connector_factory

    def _get_repo(self, backend: StorageBackend) -> IConnectionConfigRepository:
        """Resolves target repository by storage engine."""
        return self._repos.get(backend, self._repos[self._default_backend])

    async def register_connection(
        self, dto: ConnectionCreateDTO
    ) -> Result[ModelConnectionConfig, DomainError]:
        """Saves a model connectivity profile to the requested persistence engine (InMemory, YAML, or Postgres)."""
        normalized_url = resolve_endpoint(dto.endpoint_url)
        config = ModelConnectionConfig(
            connection_id=dto.connection_id,
            name=dto.name,
            protocol=dto.protocol,
            endpoint_url=normalized_url,
            model_name=dto.model_name,
            auth_method=dto.auth_method,
            auth_payload=dto.auth_payload,
            timeout_seconds=dto.timeout_seconds,
            max_retries=dto.max_retries,
            rate_limit_rpm=dto.rate_limit_rpm,
            token_capacity=dto.token_capacity,
            token_refill_rate_per_sec=dto.token_refill_rate_per_sec,
            storage_backend=dto.storage_backend,
        )

        repo = self._get_repo(dto.storage_backend)
        res = await repo.save_config(config)
        if res.is_failure:
            return Failure(res.error)

        return Success(config)

    async def list_connections(
        self, backend: StorageBackend | None = None
    ) -> Result[Sequence[ModelConnectionConfig], DomainError]:
        """Lists registered connection profiles from the specified or default storage engine."""
        target_backend = backend or self._default_backend
        repo = self._get_repo(target_backend)
        return await repo.list_configs()

    async def get_connection(
        self, connection_id: str, backend: StorageBackend | None = None
    ) -> Result[ModelConnectionConfig, DomainError]:
        """Retrieves a configuration by ID."""
        target_backend = backend or self._default_backend
        repo = self._get_repo(target_backend)
        return await repo.get_config(connection_id)

    async def check_connection_health(
        self, connection_id: str, backend: StorageBackend | None = None
    ) -> Result[HealthStatus, DomainError]:
        """Probes the live endpoint for latency and operational status."""
        config_res = await self.get_connection(connection_id, backend)
        if config_res.is_failure:
            return Failure(config_res.error)

        config = config_res.unwrap()
        conn_res = self._factory.get_connector(config.protocol)
        if conn_res.is_failure:
            return Failure(conn_res.error)

        connector = conn_res.unwrap()
        return await connector.check_health(config)

    async def list_available_models(
        self, connection_id: str, backend: StorageBackend | None = None
    ) -> Result[list[dict[str, Any]], DomainError]:
        """Discovers available models or checkpoints for a given connection profile."""
        config_res = await self.get_connection(connection_id, backend)
        if config_res.is_failure:
            return Failure(config_res.error)

        config = config_res.unwrap()
        conn_res = self._factory.get_connector(config.protocol)
        if conn_res.is_failure:
            return Failure(conn_res.error)

        connector = conn_res.unwrap()
        return await connector.list_models(config)
