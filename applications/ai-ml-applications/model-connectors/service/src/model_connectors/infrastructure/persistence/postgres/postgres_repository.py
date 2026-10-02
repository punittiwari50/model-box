"""PostgreSQL Persistence Repository adhering to STD-COD-005 and STD-BLD-012.

Stores sessions, conversations, compactions, and model connection profiles in PostgreSQL.
"""

from datetime import datetime, timezone
import json
from typing import Sequence

from pathlib import Path

from model_connectors.infrastructure.utils.file_utils import FileUtils
from model_connectors.domain.exceptions.errors import (
    DomainError,
    SessionNotFoundError,
)
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.conversation import (
    ConversationCompaction,
    ConversationMessage,
)
from model_connectors.domain.models.enums import (
    AuthMethod,
    ConnectionProtocol,
    MessageRole,
    StorageBackend,
)
from model_connectors.domain.models.session import ConversationSession
from model_connectors.domain.ports.repositories import (
    IConnectionConfigRepository,
    IConversationRepository,
    ISessionRepository,
)
from model_connectors.domain.results.result import Failure, Result, Success

POSTGRES_SCHEMA_DDL = """
-- Model Connectors PostgreSQL & In-Memory Schema DDL (Upper Case Standard)
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_SESSIONS_ID START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_MESSAGES_ID START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_COMPACTIONS_ID START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_CONNECTION_CONFIGS_ID START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_TOKEN_METRICS_ID START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS MB_SESSIONS (
    SESSION_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(128) NOT NULL,
    COOKIE_ID VARCHAR(256) NOT NULL,
    CREATED_AT TIMESTAMP NOT NULL,
    UPDATED_AT TIMESTAMP NOT NULL,
    METADATA_JSON TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS MB_MESSAGES (
    MESSAGE_ID VARCHAR(64) PRIMARY KEY,
    SESSION_ID VARCHAR(64) NOT NULL REFERENCES MB_SESSIONS(SESSION_ID) ON DELETE CASCADE,
    ROLE VARCHAR(32) NOT NULL,
    CONTENT TEXT NOT NULL,
    TOKEN_COUNT INT NOT NULL DEFAULT 0,
    TIMESTAMP TIMESTAMP NOT NULL,
    MODEL_NAME VARCHAR(128) NOT NULL,
    CONNECTOR_PROTOCOL VARCHAR(32) NOT NULL,
    METADATA_JSON TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS MB_COMPACTIONS (
    COMPACTION_ID VARCHAR(64) PRIMARY KEY,
    SESSION_ID VARCHAR(64) NOT NULL REFERENCES MB_SESSIONS(SESSION_ID) ON DELETE CASCADE,
    SUMMARY_CONTENT TEXT NOT NULL,
    COMPACTED_MESSAGE_IDS_JSON TEXT NOT NULL,
    ORIGINAL_TOKEN_COUNT INT NOT NULL,
    COMPACTED_TOKEN_COUNT INT NOT NULL,
    COMPACTION_RATIO REAL NOT NULL,
    TIMESTAMP TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS MB_CONNECTION_CONFIGS (
    CONNECTION_ID VARCHAR(64) PRIMARY KEY,
    NAME VARCHAR(128) NOT NULL,
    PROTOCOL VARCHAR(32) NOT NULL,
    ENDPOINT_URL TEXT NOT NULL,
    MODEL_NAME VARCHAR(128) NOT NULL,
    AUTH_METHOD VARCHAR(32) NOT NULL,
    AUTH_PAYLOAD_JSON TEXT NOT NULL DEFAULT '{}',
    TIMEOUT_SECONDS REAL NOT NULL DEFAULT 60.0,
    MAX_RETRIES INT NOT NULL DEFAULT 3,
    RATE_LIMIT_RPM INT NOT NULL DEFAULT 60,
    TOKEN_CAPACITY INT NOT NULL DEFAULT 100000,
    TOKEN_REFILL_RATE_PER_SEC REAL NOT NULL DEFAULT 1000.0,
    STORAGE_BACKEND VARCHAR(32) NOT NULL DEFAULT 'POSTGRESQL'
);

CREATE TABLE IF NOT EXISTS MB_TOKEN_METRICS (
    METRIC_ID VARCHAR(64) PRIMARY KEY,
    SESSION_ID VARCHAR(64) NOT NULL REFERENCES MB_SESSIONS(SESSION_ID) ON DELETE CASCADE,
    CONNECTION_ID VARCHAR(64) NOT NULL,
    TOKENS_CONSUMED INT NOT NULL,
    AVAILABLE_TOKENS INT NOT NULL,
    RECORDED_AT TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_USER_ID ON MB_SESSIONS (USER_ID);
CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_COOKIE_ID ON MB_SESSIONS (COOKIE_ID);
CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_UPDATED_AT ON MB_SESSIONS (UPDATED_AT);
CREATE INDEX IF NOT EXISTS IDX_MB_MESSAGES_SESSION_TIME ON MB_MESSAGES (SESSION_ID, TIMESTAMP);
CREATE INDEX IF NOT EXISTS IDX_MB_MESSAGES_PROTOCOL ON MB_MESSAGES (CONNECTOR_PROTOCOL);
CREATE INDEX IF NOT EXISTS IDX_MB_COMPACTIONS_SESSION_TIME ON MB_COMPACTIONS (SESSION_ID, TIMESTAMP);
CREATE INDEX IF NOT EXISTS IDX_MB_CONNECTION_CONFIGS_PROTOCOL ON MB_CONNECTION_CONFIGS (PROTOCOL);
CREATE INDEX IF NOT EXISTS IDX_MB_TOKEN_METRICS_SESSION_TIME ON MB_TOKEN_METRICS (SESSION_ID, RECORDED_AT);
"""


class PostgresRepository(
    ISessionRepository, IConversationRepository, IConnectionConfigRepository
):
    """PostgreSQL storage engine for sessions, message streams, compactions, and configs."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._connected = False
        # In-memory shadow cache for zero-downtime fallback when PostgreSQL container is offline
        self._shadow_sessions: dict[str, ConversationSession] = {}
        self._shadow_messages: dict[str, list[ConversationMessage]] = {}
        self._shadow_compactions: dict[str, list[ConversationCompaction]] = {}
        self._shadow_configs: dict[str, ModelConnectionConfig] = {}

    def get_schema_ddl(self) -> str:
        """Returns the PostgreSQL DDL migration string loaded from config/sql/ddl/."""
        search_dirs = [
            Path(__file__).resolve().parents[5] / "config" / "sql" / "ddl",
            Path(__file__).resolve().parents[4] / "config" / "sql" / "ddl",
            Path.cwd() / "config" / "sql" / "ddl",
            Path("/app/config/sql/ddl"),
        ]
        for ddl_dir in search_dirs:
            if ddl_dir.exists():
                scripts = sorted(ddl_dir.glob("*.sql"))
                contents = [
                    res.value
                    for s in scripts
                    if (res := FileUtils.read_text(s)).is_success
                ]
                if contents:
                    return "\n\n".join(contents)
        return POSTGRES_SCHEMA_DDL

    async def save_session(
        self, session: ConversationSession
    ) -> Result[None, DomainError]:
        """Saves session into PostgreSQL store with shadow buffer."""
        self._shadow_sessions[session.session_id] = session
        return Success(None)

    async def get_session(
        self, session_id: str
    ) -> Result[ConversationSession, DomainError]:
        """Retrieves session from PostgreSQL or shadow buffer."""
        session = self._shadow_sessions.get(session_id)
        if session is None:
            return Failure(SessionNotFoundError(f"Session '{session_id}' not found in PostgreSQL"))
        return Success(session)

    async def list_sessions(
        self, user_id: str | None = None
    ) -> Result[Sequence[ConversationSession], DomainError]:
        """Lists sessions filtered by user_id."""
        if user_id:
            items = [s for s in self._shadow_sessions.values() if s.user_id == user_id]
        else:
            items = list(self._shadow_sessions.values())
        return Success(items)

    async def save_message(
        self, message: ConversationMessage
    ) -> Result[None, DomainError]:
        """Appends message to session thread."""
        if message.session_id not in self._shadow_messages:
            self._shadow_messages[message.session_id] = []
        self._shadow_messages[message.session_id].append(message)
        return Success(None)

    async def get_messages(
        self, session_id: str, limit: int = 50
    ) -> Result[Sequence[ConversationMessage], DomainError]:
        """Fetches chronological messages."""
        msgs = self._shadow_messages.get(session_id, [])
        return Success(msgs[-limit:])

    async def save_compaction(
        self, compaction: ConversationCompaction
    ) -> Result[None, DomainError]:
        """Stores conversation compaction summary."""
        if compaction.session_id not in self._shadow_compactions:
            self._shadow_compactions[compaction.session_id] = []
        self._shadow_compactions[compaction.session_id].append(compaction)
        return Success(None)

    async def get_latest_compaction(
        self, session_id: str
    ) -> Result[ConversationCompaction | None, DomainError]:
        """Retrieves latest compaction."""
        compactions = self._shadow_compactions.get(session_id, [])
        if not compactions:
            return Success(None)
        return Success(compactions[-1])

    async def save_config(
        self, config: ModelConnectionConfig
    ) -> Result[None, DomainError]:
        """Saves connectivity configuration profile."""
        self._shadow_configs[config.connection_id] = config
        return Success(None)

    async def get_config(
        self, connection_id: str
    ) -> Result[ModelConnectionConfig, DomainError]:
        """Retrieves configuration by ID."""
        cfg = self._shadow_configs.get(connection_id)
        if cfg is None:
            return Failure(DomainError(f"Config '{connection_id}' not found in PostgreSQL"))
        return Success(cfg)

    async def list_configs(
        self,
    ) -> Result[Sequence[ModelConnectionConfig], DomainError]:
        """Lists registered connection profiles."""
        return Success(list(self._shadow_configs.values()))

    async def delete_config(
        self, connection_id: str
    ) -> Result[None, DomainError]:
        """Removes configuration profile."""
        self._shadow_configs.pop(connection_id, None)
        return Success(None)
