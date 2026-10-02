"""Repository port interfaces for persistence abstraction adhering to STD-COD-005."""

from typing import Protocol, Sequence

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
