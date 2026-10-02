"""In-memory SQLite Persistence Repository implementation adhering to STD-COD-005.

Fulfills ISessionRepository, IConversationRepository, and IConnectionConfigRepository.
Stores sessions, user/cookie links, full conversation messages, and compacted summaries.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
from typing import Sequence

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


SQLITE_SCHEMA_DDL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS MB_SESSIONS (
    SESSION_ID TEXT PRIMARY KEY,
    USER_ID TEXT NOT NULL,
    COOKIE_ID TEXT NOT NULL,
    CREATED_AT TEXT NOT NULL,
    UPDATED_AT TEXT NOT NULL,
    METADATA_JSON TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS MB_MESSAGES (
    MESSAGE_ID TEXT PRIMARY KEY,
    SESSION_ID TEXT NOT NULL,
    ROLE TEXT NOT NULL,
    CONTENT TEXT NOT NULL,
    TOKEN_COUNT INTEGER NOT NULL DEFAULT 0,
    TIMESTAMP TEXT NOT NULL,
    MODEL_NAME TEXT NOT NULL,
    CONNECTOR_PROTOCOL TEXT NOT NULL,
    METADATA_JSON TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY(SESSION_ID) REFERENCES MB_SESSIONS(SESSION_ID) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MB_COMPACTIONS (
    COMPACTION_ID TEXT PRIMARY KEY,
    SESSION_ID TEXT NOT NULL,
    SUMMARY_CONTENT TEXT NOT NULL,
    COMPACTED_MESSAGE_IDS_JSON TEXT NOT NULL,
    ORIGINAL_TOKEN_COUNT INTEGER NOT NULL,
    COMPACTED_TOKEN_COUNT INTEGER NOT NULL,
    COMPACTION_RATIO REAL NOT NULL,
    TIMESTAMP TEXT NOT NULL,
    FOREIGN KEY(SESSION_ID) REFERENCES MB_SESSIONS(SESSION_ID) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MB_CONNECTION_CONFIGS (
    CONNECTION_ID TEXT PRIMARY KEY,
    NAME TEXT NOT NULL,
    PROTOCOL TEXT NOT NULL,
    ENDPOINT_URL TEXT NOT NULL,
    MODEL_NAME TEXT NOT NULL,
    AUTH_METHOD TEXT NOT NULL,
    AUTH_PAYLOAD_JSON TEXT NOT NULL DEFAULT '{}',
    TIMEOUT_SECONDS REAL NOT NULL DEFAULT 60.0,
    MAX_RETRIES INTEGER NOT NULL DEFAULT 3,
    RATE_LIMIT_RPM INTEGER NOT NULL DEFAULT 60,
    TOKEN_CAPACITY INTEGER NOT NULL DEFAULT 100000,
    TOKEN_REFILL_RATE_PER_SEC REAL NOT NULL DEFAULT 1000.0,
    STORAGE_BACKEND TEXT NOT NULL DEFAULT 'IN_MEMORY'
);

CREATE TABLE IF NOT EXISTS MB_TOKEN_METRICS (
    METRIC_ID TEXT PRIMARY KEY,
    SESSION_ID TEXT NOT NULL,
    CONNECTION_ID TEXT NOT NULL,
    TOKENS_CONSUMED INTEGER NOT NULL,
    AVAILABLE_TOKENS INTEGER NOT NULL,
    RECORDED_AT TEXT NOT NULL,
    FOREIGN KEY(SESSION_ID) REFERENCES MB_SESSIONS(SESSION_ID) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_USER_ID ON MB_SESSIONS(USER_ID);
CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_COOKIE_ID ON MB_SESSIONS(COOKIE_ID);
CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_UPDATED_AT ON MB_SESSIONS(UPDATED_AT);
CREATE INDEX IF NOT EXISTS IDX_MB_MESSAGES_SESSION_TIME ON MB_MESSAGES(SESSION_ID, TIMESTAMP);
CREATE INDEX IF NOT EXISTS IDX_MB_MESSAGES_PROTOCOL ON MB_MESSAGES(CONNECTOR_PROTOCOL);
CREATE INDEX IF NOT EXISTS IDX_MB_COMPACTIONS_SESSION_TIME ON MB_COMPACTIONS(SESSION_ID, TIMESTAMP);
CREATE INDEX IF NOT EXISTS IDX_MB_CONNECTION_CONFIGS_PROTOCOL ON MB_CONNECTION_CONFIGS(PROTOCOL);
CREATE INDEX IF NOT EXISTS IDX_MB_CONNECTION_CONFIGS_MODEL ON MB_CONNECTION_CONFIGS(MODEL_NAME);
CREATE INDEX IF NOT EXISTS IDX_MB_TOKEN_METRICS_SESSION_TIME ON MB_TOKEN_METRICS(SESSION_ID, RECORDED_AT);
CREATE INDEX IF NOT EXISTS IDX_MB_TOKEN_METRICS_CONN_ID ON MB_TOKEN_METRICS(CONNECTION_ID);

-- Compatibility Views
CREATE VIEW IF NOT EXISTS sessions AS SELECT * FROM MB_SESSIONS;
CREATE VIEW IF NOT EXISTS messages AS SELECT * FROM MB_MESSAGES;
CREATE VIEW IF NOT EXISTS compactions AS SELECT * FROM MB_COMPACTIONS;
CREATE VIEW IF NOT EXISTS connection_configs AS SELECT * FROM MB_CONNECTION_CONFIGS;
CREATE VIEW IF NOT EXISTS token_metrics AS SELECT * FROM MB_TOKEN_METRICS;
"""


class InMemorySqliteRepository(
    ISessionRepository, IConversationRepository, IConnectionConfigRepository
):
    """Thread-safe SQLite storage engine for sessions, messages, compactions, and configs."""

    def __init__(self, db_path: str = ":memory:") -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._initialize_schema()

    def get_schema_ddl(self) -> str:
        """Returns the SQLite DDL migration string loaded from config/sql/sqlite/."""
        search_dirs = [
            Path(__file__).resolve().parents[5] / "config" / "sql" / "sqlite",
            Path(__file__).resolve().parents[4] / "config" / "sql" / "sqlite",
            Path.cwd() / "config" / "sql" / "sqlite",
            Path("/app/config/sql/sqlite"),
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
        return SQLITE_SCHEMA_DDL

    def _initialize_schema(self) -> None:
        """Creates database schema tables and indexes loaded from SQLite DDL scripts."""
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("PRAGMA foreign_keys = ON;")
            ddl_script = self.get_schema_ddl()
            cursor.executescript(ddl_script)
            self._conn.commit()

    async def save_session(
        self, session: ConversationSession
    ) -> Result[None, DomainError]:
        """Saves or updates a conversation session with user_id and cookie_id."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO sessions (session_id, user_id, cookie_id, created_at, updated_at, metadata_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET
                        updated_at=excluded.updated_at,
                        metadata_json=excluded.metadata_json;
                    """,
                    (
                        session.session_id,
                        session.user_id,
                        session.cookie_id,
                        session.created_at.isoformat(),
                        session.updated_at.isoformat(),
                        json.dumps(dict(session.metadata)),
                    ),
                )
                self._conn.commit()
                return Success(None)
            except Exception as exc:
                return Failure(DomainError(f"Failed to save session: {exc}"))

    async def get_session(
        self, session_id: str
    ) -> Result[ConversationSession, DomainError]:
        """Fetches a session by ID."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    "SELECT session_id, user_id, cookie_id, created_at, updated_at, metadata_json FROM sessions WHERE session_id = ?",
                    (session_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    return Failure(SessionNotFoundError(f"Session '{session_id}' not found"))

                session = ConversationSession(
                    session_id=row["session_id"],
                    user_id=row["user_id"],
                    cookie_id=row["cookie_id"],
                    created_at=datetime.fromisoformat(row["created_at"]),
                    updated_at=datetime.fromisoformat(row["updated_at"]),
                    metadata=json.loads(row["metadata_json"]),
                )
                return Success(session)
            except Exception as exc:
                return Failure(DomainError(f"Error fetching session: {exc}"))

    async def list_sessions(
        self, user_id: str | None = None
    ) -> Result[Sequence[ConversationSession], DomainError]:
        """Lists sessions, optionally filtered by user ID."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                if user_id:
                    cursor.execute(
                        "SELECT session_id, user_id, cookie_id, created_at, updated_at, metadata_json FROM sessions WHERE user_id = ? ORDER BY updated_at DESC",
                        (user_id,),
                    )
                else:
                    cursor.execute(
                        "SELECT session_id, user_id, cookie_id, created_at, updated_at, metadata_json FROM sessions ORDER BY updated_at DESC"
                    )
                rows = cursor.fetchall()
                sessions = [
                    ConversationSession(
                        session_id=r["session_id"],
                        user_id=r["user_id"],
                        cookie_id=r["cookie_id"],
                        created_at=datetime.fromisoformat(r["created_at"]),
                        updated_at=datetime.fromisoformat(r["updated_at"]),
                        metadata=json.loads(r["metadata_json"]),
                    )
                    for r in rows
                ]
                return Success(sessions)
            except Exception as exc:
                return Failure(DomainError(f"Error listing sessions: {exc}"))

    async def save_message(
        self, message: ConversationMessage
    ) -> Result[None, DomainError]:
        """Appends a new message to the session conversation."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO messages (
                        message_id, session_id, role, content, token_count,
                        timestamp, model_name, connector_protocol, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        message.message_id,
                        message.session_id,
                        message.role.value,
                        message.content,
                        message.token_count,
                        message.timestamp.isoformat(),
                        message.model_name,
                        message.connector_protocol.value,
                        json.dumps(dict(message.metadata)),
                    ),
                )
                self._conn.commit()
                return Success(None)
            except Exception as exc:
                return Failure(DomainError(f"Failed to save message: {exc}"))

    async def get_messages(
        self, session_id: str, limit: int = 50
    ) -> Result[Sequence[ConversationMessage], DomainError]:
        """Retrieves message history for a session."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    SELECT message_id, session_id, role, content, token_count,
                           timestamp, model_name, connector_protocol, metadata_json
                    FROM messages
                    WHERE session_id = ?
                    ORDER BY timestamp ASC
                    LIMIT ?
                    """,
                    (session_id, limit),
                )
                rows = cursor.fetchall()
                messages = [
                    ConversationMessage(
                        message_id=r["message_id"],
                        session_id=r["session_id"],
                        role=MessageRole(r["role"]),
                        content=r["content"],
                        token_count=r["token_count"],
                        timestamp=datetime.fromisoformat(r["timestamp"]),
                        model_name=r["model_name"],
                        connector_protocol=ConnectionProtocol(r["connector_protocol"]),
                        metadata=json.loads(r["metadata_json"]),
                    )
                    for r in rows
                ]
                return Success(messages)
            except Exception as exc:
                return Failure(DomainError(f"Failed to get messages: {exc}"))

    async def save_compaction(
        self, compaction: ConversationCompaction
    ) -> Result[None, DomainError]:
        """Persists a compacted summary of prior conversation turns."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO compactions (
                        compaction_id, session_id, summary_content,
                        compacted_message_ids_json, original_token_count,
                        compacted_token_count, compaction_ratio, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        compaction.compaction_id,
                        compaction.session_id,
                        compaction.summary_content,
                        json.dumps(list(compaction.compacted_message_ids)),
                        compaction.original_token_count,
                        compaction.compacted_token_count,
                        compaction.compaction_ratio,
                        compaction.timestamp.isoformat(),
                    ),
                )
                self._conn.commit()
                return Success(None)
            except Exception as exc:
                return Failure(DomainError(f"Failed to save compaction: {exc}"))

    async def get_latest_compaction(
        self, session_id: str
    ) -> Result[ConversationCompaction | None, DomainError]:
        """Retrieves the most recent conversation compaction for a session."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    SELECT compaction_id, session_id, summary_content,
                           compacted_message_ids_json, original_token_count,
                           compacted_token_count, compaction_ratio, timestamp
                    FROM compactions
                    WHERE session_id = ?
                    ORDER BY timestamp DESC
                    LIMIT 1
                    """,
                    (session_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    return Success(None)

                compaction = ConversationCompaction(
                    compaction_id=row["compaction_id"],
                    session_id=row["session_id"],
                    summary_content=row["summary_content"],
                    compacted_message_ids=tuple(json.loads(row["compacted_message_ids_json"])),
                    original_token_count=row["original_token_count"],
                    compacted_token_count=row["compacted_token_count"],
                    compaction_ratio=row["compaction_ratio"],
                    timestamp=datetime.fromisoformat(row["timestamp"]),
                )
                return Success(compaction)
            except Exception as exc:
                return Failure(DomainError(f"Failed to get compaction: {exc}"))

    async def save_config(
        self, config: ModelConnectionConfig
    ) -> Result[None, DomainError]:
        """Saves or updates a model connectivity configuration."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO connection_configs (
                        connection_id, name, protocol, endpoint_url, model_name,
                        auth_method, auth_payload_json, timeout_seconds, max_retries,
                        rate_limit_rpm, token_capacity, token_refill_rate_per_sec, storage_backend
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(connection_id) DO UPDATE SET
                        name=excluded.name,
                        protocol=excluded.protocol,
                        endpoint_url=excluded.endpoint_url,
                        model_name=excluded.model_name,
                        auth_method=excluded.auth_method,
                        auth_payload_json=excluded.auth_payload_json,
                        timeout_seconds=excluded.timeout_seconds,
                        max_retries=excluded.max_retries,
                        rate_limit_rpm=excluded.rate_limit_rpm,
                        token_capacity=excluded.token_capacity,
                        token_refill_rate_per_sec=excluded.token_refill_rate_per_sec,
                        storage_backend=excluded.storage_backend;
                    """,
                    (
                        config.connection_id,
                        config.name,
                        config.protocol.value,
                        config.endpoint_url,
                        config.model_name,
                        config.auth_method.value,
                        json.dumps(dict(config.auth_payload)),
                        config.timeout_seconds,
                        config.max_retries,
                        config.rate_limit_rpm,
                        config.token_capacity,
                        config.token_refill_rate_per_sec,
                        config.storage_backend.value,
                    ),
                )
                self._conn.commit()
                return Success(None)
            except Exception as exc:
                return Failure(DomainError(f"Failed to save connection config: {exc}"))

    async def get_config(
        self, connection_id: str
    ) -> Result[ModelConnectionConfig, DomainError]:
        """Retrieves a configuration by connection ID."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    SELECT connection_id, name, protocol, endpoint_url, model_name,
                           auth_method, auth_payload_json, timeout_seconds, max_retries,
                           rate_limit_rpm, token_capacity, token_refill_rate_per_sec, storage_backend
                    FROM connection_configs
                    WHERE connection_id = ?
                    """,
                    (connection_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    return Failure(DomainError(f"Config '{connection_id}' not found"))

                config = ModelConnectionConfig(
                    connection_id=row["connection_id"],
                    name=row["name"],
                    protocol=ConnectionProtocol(row["protocol"]),
                    endpoint_url=row["endpoint_url"],
                    model_name=row["model_name"],
                    auth_method=AuthMethod(row["auth_method"]),
                    auth_payload=json.loads(row["auth_payload_json"]),
                    timeout_seconds=row["timeout_seconds"],
                    max_retries=row["max_retries"],
                    rate_limit_rpm=row["rate_limit_rpm"],
                    token_capacity=row["token_capacity"],
                    token_refill_rate_per_sec=row["token_refill_rate_per_sec"],
                    storage_backend=StorageBackend(row["storage_backend"]),
                )
                return Success(config)
            except Exception as exc:
                return Failure(DomainError(f"Failed to get connection config: {exc}"))

    async def list_configs(
        self,
    ) -> Result[Sequence[ModelConnectionConfig], DomainError]:
        """Lists all registered model connection profiles."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    SELECT connection_id, name, protocol, endpoint_url, model_name,
                           auth_method, auth_payload_json, timeout_seconds, max_retries,
                           rate_limit_rpm, token_capacity, token_refill_rate_per_sec, storage_backend
                    FROM connection_configs
                    ORDER BY name ASC
                    """
                )
                rows = cursor.fetchall()
                configs = [
                    ModelConnectionConfig(
                        connection_id=r["connection_id"],
                        name=r["name"],
                        protocol=ConnectionProtocol(r["protocol"]),
                        endpoint_url=r["endpoint_url"],
                        model_name=r["model_name"],
                        auth_method=AuthMethod(r["auth_method"]),
                        auth_payload=json.loads(r["auth_payload_json"]),
                        timeout_seconds=r["timeout_seconds"],
                        max_retries=r["max_retries"],
                        rate_limit_rpm=r["rate_limit_rpm"],
                        token_capacity=r["token_capacity"],
                        token_refill_rate_per_sec=r["token_refill_rate_per_sec"],
                        storage_backend=StorageBackend(r["storage_backend"]),
                    )
                    for r in rows
                ]
                return Success(configs)
            except Exception as exc:
                return Failure(DomainError(f"Failed to list connection configs: {exc}"))

    async def delete_config(
        self, connection_id: str
    ) -> Result[None, DomainError]:
        """Removes a model connection configuration."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute("DELETE FROM connection_configs WHERE connection_id = ?", (connection_id,))
                self._conn.commit()
                return Success(None)
            except Exception as exc:
                return Failure(DomainError(f"Failed to delete config: {exc}"))
