"""Enterprise Storage Strategy Registry and Persistence Manager adhering to STD-COD-005.

Applies Strategy and Factory patterns to resolve In-Memory, PostgreSQL, SQLite,
and YAML storage engines based on the active Spring configuration profile.
"""

from abc import ABC, abstractmethod
from typing import Final, Mapping

from model_connectors.domain.constants import StorageConstants
from model_connectors.domain.models.enums import StorageBackend
from model_connectors.domain.ports.repositories import (
    IConnectionConfigRepository,
    IConversationRepository,
    ISessionRepository,
)
from model_connectors.infrastructure.config.settings import AppConfig, StorageConfig
from model_connectors.infrastructure.persistence.in_memory.sqlite_repository import (
    InMemorySqliteRepository,
)
from model_connectors.infrastructure.persistence.postgres.postgres_repository import (
    PostgresRepository,
)
from model_connectors.infrastructure.persistence.yaml_store.yaml_repository import (
    YamlConnectionConfigRepository,
)


class IStorageBundle(ABC):
    """Bundle providing matching session, conversation, and config repositories."""

    @property
    @abstractmethod
    def session_repo(self) -> ISessionRepository: ...

    @property
    @abstractmethod
    def conversation_repo(self) -> IConversationRepository: ...

    @property
    @abstractmethod
    def config_repo(self) -> IConnectionConfigRepository: ...


class InMemoryStorageBundle(IStorageBundle):
    """Storage bundle backed by in-memory SQLite tables."""

    def __init__(self, db_path: str = StorageConstants.DEFAULT_SQLITE_PATH) -> None:
        self._repo = InMemorySqliteRepository(db_path)

    @property
    def session_repo(self) -> ISessionRepository:
        return self._repo

    @property
    def conversation_repo(self) -> IConversationRepository:
        return self._repo

    @property
    def config_repo(self) -> IConnectionConfigRepository:
        return self._repo


class PostgresStorageBundle(IStorageBundle):
    """Storage bundle backed by enterprise PostgreSQL persistence."""

    def __init__(self, dsn: str = StorageConstants.DEFAULT_POSTGRES_DSN) -> None:
        self._repo = PostgresRepository(dsn)

    @property
    def session_repo(self) -> ISessionRepository:
        return self._repo

    @property
    def conversation_repo(self) -> IConversationRepository:
        return self._repo

    @property
    def config_repo(self) -> IConnectionConfigRepository:
        return self._repo


class StorageManager:
    """Strategy Factory resolving persistence bundles based on environment configuration."""

    def __init__(self, storage_config: StorageConfig) -> None:
        self._config = storage_config

        # Instantiate storage strategies
        self._in_memory_bundle = InMemoryStorageBundle(storage_config.sqlite_db_path)
        self._postgres_bundle = PostgresStorageBundle(storage_config.postgres_dsn)
        self._yaml_repo = YamlConnectionConfigRepository(storage_config.yaml_config_dir)

        self._bundles: dict[StorageBackend, IStorageBundle] = {
            StorageBackend.IN_MEMORY: self._in_memory_bundle,
            StorageBackend.POSTGRESQL: self._postgres_bundle,
        }

        self._config_repositories: dict[StorageBackend, IConnectionConfigRepository] = {
            StorageBackend.IN_MEMORY: self._in_memory_bundle.config_repo,
            StorageBackend.POSTGRESQL: self._postgres_bundle.config_repo,
            StorageBackend.YAML: self._yaml_repo,
        }

    @property
    def active_bundle(self) -> IStorageBundle:
        """Resolves the configured default storage bundle."""
        return self._bundles.get(self._config.default_backend, self._in_memory_bundle)

    @property
    def session_repository(self) -> ISessionRepository:
        return self.active_bundle.session_repo

    @property
    def conversation_repository(self) -> IConversationRepository:
        return self.active_bundle.conversation_repo

    @property
    def config_repositories(self) -> Mapping[StorageBackend, IConnectionConfigRepository]:
        return self._config_repositories
