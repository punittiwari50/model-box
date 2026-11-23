"""Repository port interfaces for persistence abstraction adhering to STD-COD-005."""

from typing import Any, Protocol, Sequence, runtime_checkable

from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.conversation import (
    ConversationCompaction,
    ConversationMessage,
)
from model_connectors.domain.models.session import ConversationSession
from model_connectors.domain.results.result import Result


class ISessionRepository(Protocol):
    """Port for persisting and retrieving user conversation sessions."""

    async def save_session(
        self, session: ConversationSession
    ) -> Result[None, DomainError]:
        """Saves or updates a conversation session."""
        ...

    async def get_session(
        self, session_id: str
    ) -> Result[ConversationSession, DomainError]:
        """Retrieves a session by unique identifier."""
        ...

    async def list_sessions(
        self, user_id: str | None = None
    ) -> Result[Sequence[ConversationSession], DomainError]:
        """Lists sessions, optionally filtered by user ID."""
        ...


class IConversationRepository(Protocol):
    """Port for persisting messages and compacted conversation summaries."""

    async def save_message(
        self, message: ConversationMessage
    ) -> Result[None, DomainError]:
        """Appends a new message to the session conversation."""
        ...

    async def get_messages(
        self, session_id: str, limit: int = 50
    ) -> Result[Sequence[ConversationMessage], DomainError]:
        """Retrieves chronological message history for a session."""
        ...

    async def get_project_messages(
        self, project_id: str, limit: int = 100
    ) -> Result[Sequence[ConversationMessage], DomainError]:
        """Retrieves chronological message history for a project across all sessions."""
        ...

    async def save_compaction(
        self, compaction: ConversationCompaction
    ) -> Result[None, DomainError]:
        """Persists a compacted summary of prior conversation turns."""
        ...

    async def get_latest_compaction(
        self, session_id: str
    ) -> Result[ConversationCompaction | None, DomainError]:
        """Retrieves the most recent conversation compaction for a session."""
        ...


class IProjectRepository(Protocol):
    """Port for persisting and querying enterprise model projects."""

    async def save_project(self, project: Any) -> Result[None, DomainError]:
        """Saves or updates a project."""
        ...

    async def get_project(self, project_id: str) -> Result[Any | None, DomainError]:
        """Retrieves project by ID."""
        ...

    async def list_projects(self) -> Result[Sequence[Any], DomainError]:
        """Lists all registered projects."""
        ...


class IConnectionConfigRepository(Protocol):
    """Port for storing model connectivity configuration profiles."""

    async def save_config(
        self, config: ModelConnectionConfig
    ) -> Result[None, DomainError]:
        """Saves or updates a model connectivity configuration."""
        ...

    async def get_config(
        self, connection_id: str
    ) -> Result[ModelConnectionConfig, DomainError]:
        """Retrieves a configuration by connection ID."""
        ...

    async def list_configs(
        self,
    ) -> Result[Sequence[ModelConnectionConfig], DomainError]:
        """Lists all registered model connection profiles."""
        ...

    async def delete_config(
        self, connection_id: str
    ) -> Result[None, DomainError]:
        """Removes a model connection configuration."""
        ...


@runtime_checkable
class IXRayBestPracticeRepository(Protocol):
    """Port for persisting and retrieving enterprise Google X-Ray search best practices."""

    async def list_practices(
        self, category: str | None = None
    ) -> Result[Sequence[Any], DomainError]:
        """Lists active enterprise Google X-Ray search best practices from DML."""
        ...

    async def get_practice(
        self, practice_id: str
    ) -> Result[Any, DomainError]:
        """Retrieves an X-Ray search best practice by ID."""
        ...

    async def save_practice(
        self, practice: Any
    ) -> Result[None, DomainError]:
        """Saves or updates an X-Ray search best practice."""
        ...


@runtime_checkable
class ITrustedPortalRepository(Protocol):
    """Port for persisting and querying official company portals and verified logos from DML."""

    async def list_portals(
        self, portal_type: str | None = None, is_active: bool = True
    ) -> Result[Sequence[Any], DomainError]:
        """Lists official portals with verified logos loaded from DML."""
        ...

    async def get_portal(
        self, portal_id: str
    ) -> Result[Any, DomainError]:
        """Retrieves official portal info by portal ID."""
        ...

    async def save_portal(
        self, portal: Any
    ) -> Result[None, DomainError]:
        """Persists or updates official portal record."""
        ...


@runtime_checkable
class IOfficialSchemaRepository(Protocol):
    """Port for persisting and querying official response schemas (e.g. Schema.org JobPosting)."""

    async def list_schemas(
        self, is_active: bool = True
    ) -> Result[Sequence[Any], DomainError]:
        """Lists official response JSON schemas loaded from DML."""
        ...

    async def get_schema(
        self, schema_id: str
    ) -> Result[Any, DomainError]:
        """Retrieves official response JSON schema by ID."""
        ...

    async def save_schema(
        self, schema: Any
    ) -> Result[None, DomainError]:
        """Persists or updates official response JSON schema."""
        ...


