"""SQLite Persistence Repository implementation adhering to STD-COD-005.

Fulfills ISessionRepository, IConversationRepository, IConnectionConfigRepository, and IProjectRepository.
Loads external DDL from SQL script files (schema.sqlite.sql). No inline DDL statements in Python.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
from typing import Any, Sequence

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
from model_connectors.domain.models.project import Project
from model_connectors.domain.models.session import ConversationSession
from model_connectors.domain.ports.repositories import (
    IConnectionConfigRepository,
    IConversationRepository,
    IProjectRepository,
    ISessionRepository,
)
from model_connectors.domain.results.result import Failure, Result, Success


class InMemorySqliteRepository(
    ISessionRepository,
    IConversationRepository,
    IConnectionConfigRepository,
    IProjectRepository,
):
    """Thread-safe SQLite storage engine for projects, sessions, messages, and configs."""

    def __init__(self, db_path: str = ":memory:") -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._initialize_schema()
        self._seed_default_projects()

    def get_schema_ddl(self) -> str:
        """Loads SQLite DDL schema from external .sql script file.
        
        Strict adherence to architectural rule: DDL is defined in SQL files,
        not embedded inside application code.
        """
        search_candidates = [
            Path(__file__).resolve().parents[5] / "config" / "sql" / "schema.sqlite.sql",
            Path(__file__).resolve().parents[4] / "config" / "sql" / "schema.sqlite.sql",
            Path.cwd() / "config" / "sql" / "schema.sqlite.sql",
            Path("/app/config/sql/schema.sqlite.sql"),
        ]
        for candidate in search_candidates:
            if candidate.exists():
                read_res = FileUtils.read_text(candidate)
                if read_res.is_success and read_res.value:
                    return read_res.value

        # Fallback to modular sqlite ddl directory
        ddl_dir_candidates = [
            Path(__file__).resolve().parents[5] / "config" / "sql" / "sqlite",
            Path(__file__).resolve().parents[4] / "config" / "sql" / "sqlite",
            Path.cwd() / "config" / "sql" / "sqlite",
            Path("/app/config/sql/sqlite"),
        ]
        for ddl_dir in ddl_dir_candidates:
            if ddl_dir.exists():
                scripts = sorted(ddl_dir.glob("*.sql"))
                contents = [
                    res.value
                    for s in scripts
                    if (res := FileUtils.read_text(s)).is_success
                ]
                if contents:
                    return "\n\n".join(contents)

        raise FileNotFoundError(
            "SQLite DDL script not found. Expected schema.sqlite.sql in config/sql/."
        )

    def _initialize_schema(self) -> None:
        """Executes external DDL script to create tables and indexes."""
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("PRAGMA foreign_keys = ON;")
            ddl_script = self.get_schema_ddl()
            cursor.executescript(ddl_script)
            self._conn.commit()

    def _seed_default_projects(self) -> None:
        """Seeds the two required initial enterprise projects if not present."""
        initial_projects = [
            Project(
                project_id="linkedin-job-hunter",
                name="LinkedIn Job Hunter & Job Preparation",
                description="AI-powered LinkedIn job search assistant, resume tailoring, ATS optimization, and interactive mock interview coaching.",
                tags=("career", "linkedin", "job-hunting", "interview-prep", "resume-ai"),
                assigned_users=("job-seeker", "career-coach", "recruiter", "tech-lead"),
                system_prompt="You are an expert LinkedIn Career Coach and Executive Job Search Strategist. You help candidates discover optimal job roles, craft ATS-compliant resumes, write high-conversion LinkedIn connection notes, analyze job descriptions for required competencies, and run rigorous behavioral and technical mock interviews.",
                metadata={"category": "career_growth", "icon": "briefcase"},
            ),
            Project(
                project_id="animation-films-creation",
                name="Animation Films & Stories Creation",
                description="Cinematic storyboarding, character design, script generation, scene direction, and ComfyUI generative Pixar-style animation pipeline.",
                tags=("cinematic", "storyboarding", "pixar-3d", "animation", "generative-media"),
                assigned_users=("film-director", "lead-animator", "screenwriter", "art-director"),
                system_prompt="You are a Cinematic Director and Master Pixar-style Storyteller. You help creators conceptualize compelling narrative arcs, develop rich characters, write structured screenplay scenes with lighting/camera angles, and generate structured prompts and parameters for ComfyUI 3D diffusion workflows.",
                metadata={"category": "creative_studio", "icon": "film"},
            ),
        ]
        with self._lock:
            cursor = self._conn.cursor()
            for p in initial_projects:
                cursor.execute("SELECT PROJECT_ID FROM MB_PROJECTS WHERE PROJECT_ID = ?", (p.project_id,))
                if not cursor.fetchone():
                    cursor.execute(
                        """
                        INSERT INTO MB_PROJECTS (
                            PROJECT_ID, NAME, DESCRIPTION, TAGS_JSON, ASSIGNED_USERS_JSON,
                            SYSTEM_PROMPT, CREATED_AT, UPDATED_AT, METADATA_JSON
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            p.project_id,
                            p.name,
                            p.description,
                            json.dumps(list(p.tags)),
                            json.dumps(list(p.assigned_users)),
                            p.system_prompt,
                            p.created_at.isoformat(),
                            p.updated_at.isoformat(),
                            json.dumps(dict(p.metadata)),
                        ),
                    )
            self._conn.commit()

    # --------------------------------------------------------------------------
    # IProjectRepository Implementation
    # --------------------------------------------------------------------------
    async def save_project(self, project: Project) -> Result[None, DomainError]:
        """Saves or updates an enterprise project workspace."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO MB_PROJECTS (
                        PROJECT_ID, NAME, DESCRIPTION, TAGS_JSON, ASSIGNED_USERS_JSON,
                        SYSTEM_PROMPT, CREATED_AT, UPDATED_AT, METADATA_JSON
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(PROJECT_ID) DO UPDATE SET
                        NAME = excluded.NAME,
                        DESCRIPTION = excluded.DESCRIPTION,
                        TAGS_JSON = excluded.TAGS_JSON,
                        ASSIGNED_USERS_JSON = excluded.ASSIGNED_USERS_JSON,
                        SYSTEM_PROMPT = excluded.SYSTEM_PROMPT,
                        UPDATED_AT = excluded.UPDATED_AT,
                        METADATA_JSON = excluded.METADATA_JSON
                    """,
                    (
                        project.project_id,
                        project.name,
                        project.description,
                        json.dumps(list(project.tags)),
                        json.dumps(list(project.assigned_users)),
                        project.system_prompt,
                        project.created_at.isoformat(),
                        project.updated_at.isoformat(),
                        json.dumps(dict(project.metadata)),
                    ),
                )
                self._conn.commit()
                return Success(None)
            except Exception as exc:
                return Failure(DomainError(f"Failed to save project: {exc}"))

    async def get_project(self, project_id: str) -> Result[Project | None, DomainError]:
        """Retrieves a project by ID."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    SELECT PROJECT_ID, NAME, DESCRIPTION, TAGS_JSON, ASSIGNED_USERS_JSON,
                           SYSTEM_PROMPT, CREATED_AT, UPDATED_AT, METADATA_JSON
                    FROM MB_PROJECTS WHERE PROJECT_ID = ?
                    """,
                    (project_id,),
                )
                row = cursor.fetchone()
                if not row:
                    return Success(None)
                p = Project(
                    project_id=row["PROJECT_ID"],
                    name=row["NAME"],
                    description=row["DESCRIPTION"],
                    tags=tuple(json.loads(row["TAGS_JSON"])),
                    assigned_users=tuple(json.loads(row["ASSIGNED_USERS_JSON"])),
                    system_prompt=row["SYSTEM_PROMPT"],
                    created_at=datetime.fromisoformat(row["CREATED_AT"]),
                    updated_at=datetime.fromisoformat(row["UPDATED_AT"]),
                    metadata=json.loads(row["METADATA_JSON"]),
                )
                return Success(p)
            except Exception as exc:
                return Failure(DomainError(f"Failed to fetch project: {exc}"))

    async def list_projects(self) -> Result[Sequence[Project], DomainError]:
        """Lists all registered enterprise projects."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    SELECT PROJECT_ID, NAME, DESCRIPTION, TAGS_JSON, ASSIGNED_USERS_JSON,
                           SYSTEM_PROMPT, CREATED_AT, UPDATED_AT, METADATA_JSON
                    FROM MB_PROJECTS ORDER BY CREATED_AT ASC
                    """
                )
                rows = cursor.fetchall()
                projects = [
                    Project(
                        project_id=r["PROJECT_ID"],
                        name=r["NAME"],
                        description=r["DESCRIPTION"],
                        tags=tuple(json.loads(r["TAGS_JSON"])),
                        assigned_users=tuple(json.loads(r["ASSIGNED_USERS_JSON"])),
                        system_prompt=r["SYSTEM_PROMPT"],
                        created_at=datetime.fromisoformat(r["CREATED_AT"]),
                        updated_at=datetime.fromisoformat(r["UPDATED_AT"]),
                        metadata=json.loads(r["METADATA_JSON"]),
                    )
                    for r in rows
                ]
                return Success(projects)
            except Exception as exc:
                return Failure(DomainError(f"Failed to list projects: {exc}"))

    # --------------------------------------------------------------------------
    # ISessionRepository Implementation
    # --------------------------------------------------------------------------
    async def save_session(
        self, session: ConversationSession
    ) -> Result[None, DomainError]:
        """Saves or updates a conversation session."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO MB_SESSIONS (SESSION_ID, USER_ID, COOKIE_ID, CREATED_AT, UPDATED_AT, METADATA_JSON)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(SESSION_ID) DO UPDATE SET
                        USER_ID = excluded.USER_ID,
                        COOKIE_ID = excluded.COOKIE_ID,
                        UPDATED_AT = excluded.UPDATED_AT,
                        METADATA_JSON = excluded.METADATA_JSON
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
        """Retrieves a session by unique identifier."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    "SELECT SESSION_ID, USER_ID, COOKIE_ID, CREATED_AT, UPDATED_AT, METADATA_JSON FROM MB_SESSIONS WHERE SESSION_ID = ?",
                    (session_id,),
                )
                row = cursor.fetchone()
                if not row:
                    return Failure(SessionNotFoundError(f"Session '{session_id}' not found."))
                session = ConversationSession(
                    session_id=row["SESSION_ID"],
                    user_id=row["USER_ID"],
                    cookie_id=row["COOKIE_ID"],
                    created_at=datetime.fromisoformat(row["CREATED_AT"]),
                    updated_at=datetime.fromisoformat(row["UPDATED_AT"]),
                    metadata=json.loads(row["METADATA_JSON"]),
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
                        "SELECT SESSION_ID, USER_ID, COOKIE_ID, CREATED_AT, UPDATED_AT, METADATA_JSON FROM MB_SESSIONS WHERE USER_ID = ? ORDER BY UPDATED_AT DESC",
                        (user_id,),
                    )
                else:
                    cursor.execute(
                        "SELECT SESSION_ID, USER_ID, COOKIE_ID, CREATED_AT, UPDATED_AT, METADATA_JSON FROM MB_SESSIONS ORDER BY UPDATED_AT DESC"
                    )
                rows = cursor.fetchall()
                sessions = [
                    ConversationSession(
                        session_id=r["SESSION_ID"],
                        user_id=r["USER_ID"],
                        cookie_id=r["COOKIE_ID"],
                        created_at=datetime.fromisoformat(r["CREATED_AT"]),
                        updated_at=datetime.fromisoformat(r["UPDATED_AT"]),
                        metadata=json.loads(r["METADATA_JSON"]),
                    )
                    for r in rows
                ]
                return Success(sessions)
            except Exception as exc:
                return Failure(DomainError(f"Error listing sessions: {exc}"))

    # --------------------------------------------------------------------------
    # IConversationRepository Implementation
    # --------------------------------------------------------------------------
    async def save_message(
        self, message: ConversationMessage
    ) -> Result[None, DomainError]:
        """Appends a new message to the conversation."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO MB_SESSIONS (
                        SESSION_ID, PROJECT_ID, USER_ID, COOKIE_ID, CREATED_AT, UPDATED_AT, METADATA_JSON
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        message.session_id,
                        getattr(message, "project_id", "default"),
                        getattr(message, "user_tag", "general"),
                        "default-cookie",
                        message.timestamp.isoformat(),
                        message.timestamp.isoformat(),
                        "{}",
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO MB_MESSAGES (
                        MESSAGE_ID, SESSION_ID, PROJECT_ID, USER_TAG, ROLE, CONTENT, TOKEN_COUNT,
                        TIMESTAMP, MODEL_NAME, CONNECTOR_PROTOCOL, METADATA_JSON
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        message.message_id,
                        message.session_id,
                        getattr(message, "project_id", "default"),
                        getattr(message, "user_tag", "general"),
                        message.role.value if hasattr(message.role, "value") else str(message.role),
                        message.content,
                        message.token_count,
                        message.timestamp.isoformat(),
                        message.model_name,
                        message.connector_protocol.value if hasattr(message.connector_protocol, "value") else str(message.connector_protocol),
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
                    SELECT MESSAGE_ID, SESSION_ID, PROJECT_ID, USER_TAG, ROLE, CONTENT, TOKEN_COUNT,
                           TIMESTAMP, MODEL_NAME, CONNECTOR_PROTOCOL, METADATA_JSON
                    FROM MB_MESSAGES
                    WHERE SESSION_ID = ?
                    ORDER BY TIMESTAMP ASC
                    LIMIT ?
                    """,
                    (session_id, limit),
                )
                rows = cursor.fetchall()
                messages = [
                    ConversationMessage(
                        message_id=r["MESSAGE_ID"],
                        session_id=r["SESSION_ID"],
                        role=MessageRole(r["ROLE"]),
                        content=r["CONTENT"],
                        token_count=r["TOKEN_COUNT"],
                        timestamp=datetime.fromisoformat(r["TIMESTAMP"]),
                        model_name=r["MODEL_NAME"],
                        connector_protocol=ConnectionProtocol(r["CONNECTOR_PROTOCOL"]),
                        project_id=r["PROJECT_ID"] if "PROJECT_ID" in r.keys() else "default",
                        user_tag=r["USER_TAG"] if "USER_TAG" in r.keys() else "general",
                        metadata=json.loads(r["METADATA_JSON"]),
                    )
                    for r in rows
                ]
                return Success(messages)
            except Exception as exc:
                return Failure(DomainError(f"Failed to fetch messages: {exc}"))

    async def get_project_messages(
        self, project_id: str, limit: int = 100
    ) -> Result[Sequence[ConversationMessage], DomainError]:
        """Retrieves chronological message history for a project across all sessions."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    SELECT MESSAGE_ID, SESSION_ID, PROJECT_ID, USER_TAG, ROLE, CONTENT, TOKEN_COUNT,
                           TIMESTAMP, MODEL_NAME, CONNECTOR_PROTOCOL, METADATA_JSON
                    FROM MB_MESSAGES
                    WHERE PROJECT_ID = ?
                    ORDER BY TIMESTAMP ASC
                    LIMIT ?
                    """,
                    (project_id, limit),
                )
                rows = cursor.fetchall()
                messages = [
                    ConversationMessage(
                        message_id=r["MESSAGE_ID"],
                        session_id=r["SESSION_ID"],
                        role=MessageRole(r["ROLE"]),
                        content=r["CONTENT"],
                        token_count=r["TOKEN_COUNT"],
                        timestamp=datetime.fromisoformat(r["TIMESTAMP"]),
                        model_name=r["MODEL_NAME"],
                        connector_protocol=ConnectionProtocol(r["CONNECTOR_PROTOCOL"]),
                        project_id=r["PROJECT_ID"],
                        user_tag=r["USER_TAG"],
                        metadata=json.loads(r["METADATA_JSON"]),
                    )
                    for r in rows
                ]
                return Success(messages)
            except Exception as exc:
                return Failure(DomainError(f"Failed to fetch project messages: {exc}"))

    async def save_compaction(
        self, compaction: ConversationCompaction
    ) -> Result[None, DomainError]:
        """Persists a compacted summary of prior conversation turns."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO MB_COMPACTIONS (
                        COMPACTION_ID, SESSION_ID, SUMMARY_CONTENT, COMPACTED_MESSAGE_IDS_JSON,
                        ORIGINAL_TOKEN_COUNT, COMPACTED_TOKEN_COUNT, COMPACTION_RATIO, TIMESTAMP
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
                    SELECT COMPACTION_ID, SESSION_ID, SUMMARY_CONTENT, COMPACTED_MESSAGE_IDS_JSON,
                           ORIGINAL_TOKEN_COUNT, COMPACTED_TOKEN_COUNT, COMPACTION_RATIO, TIMESTAMP
                    FROM MB_COMPACTIONS
                    WHERE SESSION_ID = ?
                    ORDER BY TIMESTAMP DESC
                    LIMIT 1
                    """,
                    (session_id,),
                )
                row = cursor.fetchone()
                if not row:
                    return Success(None)
                compaction = ConversationCompaction(
                    compaction_id=row["COMPACTION_ID"],
                    session_id=row["SESSION_ID"],
                    summary_content=row["SUMMARY_CONTENT"],
                    compacted_message_ids=tuple(json.loads(row["COMPACTED_MESSAGE_IDS_JSON"])),
                    original_token_count=row["ORIGINAL_TOKEN_COUNT"],
                    compacted_token_count=row["COMPACTED_TOKEN_COUNT"],
                    compaction_ratio=row["COMPACTION_RATIO"],
                    timestamp=datetime.fromisoformat(row["TIMESTAMP"]),
                )
                return Success(compaction)
            except Exception as exc:
                return Failure(DomainError(f"Failed to fetch compaction: {exc}"))

    # --------------------------------------------------------------------------
    # IConnectionConfigRepository Implementation
    # --------------------------------------------------------------------------
    async def save_config(
        self, config: ModelConnectionConfig
    ) -> Result[None, DomainError]:
        """Saves or updates a model connectivity configuration."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO MB_CONNECTION_CONFIGS (
                        CONNECTION_ID, NAME, PROTOCOL, ENDPOINT_URL, MODEL_NAME,
                        AUTH_METHOD, AUTH_PAYLOAD_JSON, TIMEOUT_SECONDS, MAX_RETRIES,
                        RATE_LIMIT_RPM, TOKEN_CAPACITY, TOKEN_REFILL_RATE_PER_SEC, STORAGE_BACKEND
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(CONNECTION_ID) DO UPDATE SET
                        NAME = excluded.NAME,
                        PROTOCOL = excluded.PROTOCOL,
                        ENDPOINT_URL = excluded.ENDPOINT_URL,
                        MODEL_NAME = excluded.MODEL_NAME,
                        AUTH_METHOD = excluded.AUTH_METHOD,
                        AUTH_PAYLOAD_JSON = excluded.AUTH_PAYLOAD_JSON,
                        TIMEOUT_SECONDS = excluded.TIMEOUT_SECONDS,
                        MAX_RETRIES = excluded.MAX_RETRIES,
                        RATE_LIMIT_RPM = excluded.RATE_LIMIT_RPM,
                        TOKEN_CAPACITY = excluded.TOKEN_CAPACITY,
                        TOKEN_REFILL_RATE_PER_SEC = excluded.TOKEN_REFILL_RATE_PER_SEC,
                        STORAGE_BACKEND = excluded.STORAGE_BACKEND
                    """,
                    (
                        config.connection_id,
                        config.name,
                        config.protocol.value if hasattr(config.protocol, "value") else str(config.protocol),
                        config.endpoint_url,
                        config.model_name,
                        config.auth_method.value if hasattr(config.auth_method, "value") else str(config.auth_method),
                        json.dumps(dict(config.auth_payload)),
                        config.timeout_seconds,
                        config.max_retries,
                        config.rate_limit_rpm,
                        config.token_capacity,
                        config.token_refill_rate_per_sec,
                        config.storage_backend.value if hasattr(config.storage_backend, "value") else str(config.storage_backend),
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
                    SELECT CONNECTION_ID, NAME, PROTOCOL, ENDPOINT_URL, MODEL_NAME,
                           AUTH_METHOD, AUTH_PAYLOAD_JSON, TIMEOUT_SECONDS, MAX_RETRIES,
                           RATE_LIMIT_RPM, TOKEN_CAPACITY, TOKEN_REFILL_RATE_PER_SEC, STORAGE_BACKEND
                    FROM MB_CONNECTION_CONFIGS WHERE CONNECTION_ID = ?
                    """,
                    (connection_id,),
                )
                row = cursor.fetchone()
                if not row:
                    return Failure(DomainError(f"Config '{connection_id}' not found."))
                cfg = ModelConnectionConfig(
                    connection_id=row["CONNECTION_ID"],
                    name=row["NAME"],
                    protocol=ConnectionProtocol(row["PROTOCOL"]),
                    endpoint_url=row["ENDPOINT_URL"],
                    model_name=row["MODEL_NAME"],
                    auth_method=AuthMethod(row["AUTH_METHOD"]),
                    auth_payload=json.loads(row["AUTH_PAYLOAD_JSON"]),
                    timeout_seconds=row["TIMEOUT_SECONDS"],
                    max_retries=row["MAX_RETRIES"],
                    rate_limit_rpm=row["RATE_LIMIT_RPM"],
                    token_capacity=row["TOKEN_CAPACITY"],
                    token_refill_rate_per_sec=row["TOKEN_REFILL_RATE_PER_SEC"],
                    storage_backend=StorageBackend(row["STORAGE_BACKEND"]),
                )
                return Success(cfg)
            except Exception as exc:
                return Failure(DomainError(f"Failed to fetch config: {exc}"))

    async def list_configs(
        self,
    ) -> Result[Sequence[ModelConnectionConfig], DomainError]:
        """Lists all registered model connection profiles."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    """
                    SELECT CONNECTION_ID, NAME, PROTOCOL, ENDPOINT_URL, MODEL_NAME,
                           AUTH_METHOD, AUTH_PAYLOAD_JSON, TIMEOUT_SECONDS, MAX_RETRIES,
                           RATE_LIMIT_RPM, TOKEN_CAPACITY, TOKEN_REFILL_RATE_PER_SEC, STORAGE_BACKEND
                    FROM MB_CONNECTION_CONFIGS
                    """
                )
                rows = cursor.fetchall()
                configs = [
                    ModelConnectionConfig(
                        connection_id=r["CONNECTION_ID"],
                        name=r["NAME"],
                        protocol=ConnectionProtocol(r["PROTOCOL"]),
                        endpoint_url=r["ENDPOINT_URL"],
                        model_name=r["MODEL_NAME"],
                        auth_method=AuthMethod(r["AUTH_METHOD"]),
                        auth_payload=json.loads(r["AUTH_PAYLOAD_JSON"]),
                        timeout_seconds=r["TIMEOUT_SECONDS"],
                        max_retries=r["MAX_RETRIES"],
                        rate_limit_rpm=r["RATE_LIMIT_RPM"],
                        token_capacity=r["TOKEN_CAPACITY"],
                        token_refill_rate_per_sec=r["TOKEN_REFILL_RATE_PER_SEC"],
                        storage_backend=StorageBackend(r["STORAGE_BACKEND"]),
                    )
                    for r in rows
                ]
                return Success(configs)
            except Exception as exc:
                return Failure(DomainError(f"Failed to list configs: {exc}"))

    async def delete_config(
        self, connection_id: str
    ) -> Result[None, DomainError]:
        """Removes a model connection configuration."""
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(
                    "DELETE FROM MB_CONNECTION_CONFIGS WHERE CONNECTION_ID = ?",
                    (connection_id,),
                )
                self._conn.commit()
                return Success(None)
            except Exception as exc:
                return Failure(DomainError(f"Failed to delete config: {exc}"))
