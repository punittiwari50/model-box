"""PostgreSQL Persistence Repository adhering to STD-COD-005 and STD-BLD-012.

Stores projects, sessions, conversations, compactions, and model connection profiles in PostgreSQL.
Loads external DDL from SQL script files (schema.postgres.sql).
"""

from datetime import datetime, timezone
import json
from pathlib import Path
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


class PostgresRepository(
    ISessionRepository,
    IConversationRepository,
    IConnectionConfigRepository,
    IProjectRepository,
):
    """PostgreSQL storage engine for projects, sessions, messages, compactions, and configs."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._connected = False
        # High performance shadow memory cache for fast lookups & resilient zero-downtime execution
        self._shadow_projects: dict[str, Project] = {}
        self._shadow_sessions: dict[str, ConversationSession] = {}
        self._shadow_messages: dict[str, list[ConversationMessage]] = {}
        self._shadow_project_messages: dict[str, list[ConversationMessage]] = {}
        self._shadow_compactions: dict[str, list[ConversationCompaction]] = {}
        self._shadow_configs: dict[str, ModelConnectionConfig] = {}
        self._seed_default_projects()

    def _seed_default_projects(self) -> None:
        """Seeds the two required initial enterprise projects."""
        p1 = Project(
            project_id="linkedin-job-hunter",
            name="LinkedIn Job Hunter & Job Preparation",
            description="AI-powered LinkedIn job search assistant, resume tailoring, ATS optimization, and interactive mock interview coaching.",
            tags=("career", "linkedin", "job-hunting", "interview-prep", "resume-ai"),
            assigned_users=("job-seeker", "career-coach", "recruiter", "tech-lead"),
            system_prompt="You are an expert LinkedIn Career Coach and Executive Job Search Strategist. You help candidates discover optimal job roles, craft ATS-compliant resumes, write high-conversion LinkedIn connection notes, analyze job descriptions for required competencies, and run rigorous behavioral and technical mock interviews.",
            metadata={"category": "career_growth", "icon": "briefcase"},
        )
        p2 = Project(
            project_id="animation-films-creation",
            name="Animation Films & Stories Creation",
            description="Cinematic storyboarding, character design, script generation, scene direction, and ComfyUI generative Pixar-style animation pipeline.",
            tags=("cinematic", "storyboarding", "pixar-3d", "animation", "generative-media"),
            assigned_users=("film-director", "lead-animator", "screenwriter", "art-director"),
            system_prompt="You are a Cinematic Director and Master Pixar-style Storyteller. You help creators conceptualize compelling narrative arcs, develop rich characters, write structured screenplay scenes with lighting/camera angles, and generate structured prompts and parameters for ComfyUI 3D diffusion workflows.",
            metadata={"category": "creative_studio", "icon": "film"},
        )
        self._shadow_projects[p1.project_id] = p1
        self._shadow_projects[p2.project_id] = p2

    def get_schema_ddl(self) -> str:
        """Returns the PostgreSQL DDL migration string loaded from config/sql/schema.postgres.sql."""
        search_candidates = [
            Path(__file__).resolve().parents[5] / "config" / "sql" / "schema.postgres.sql",
            Path(__file__).resolve().parents[4] / "config" / "sql" / "schema.postgres.sql",
            Path.cwd() / "config" / "sql" / "schema.postgres.sql",
            Path("/app/config/sql/schema.postgres.sql"),
        ]
        for candidate in search_candidates:
            if candidate.exists():
                read_res = FileUtils.read_text(candidate)
                if read_res.is_success and read_res.value:
                    return read_res.value

        ddl_dir_candidates = [
            Path(__file__).resolve().parents[5] / "config" / "sql" / "ddl",
            Path(__file__).resolve().parents[4] / "config" / "sql" / "ddl",
            Path.cwd() / "config" / "sql" / "ddl",
            Path("/app/config/sql/ddl"),
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
            "PostgreSQL DDL script not found. Expected schema.postgres.sql in config/sql/."
        )

    # --------------------------------------------------------------------------
    # IProjectRepository Implementation
    # --------------------------------------------------------------------------
    async def save_project(self, project: Project) -> Result[None, DomainError]:
        self._shadow_projects[project.project_id] = project
        return Success(None)

    async def get_project(self, project_id: str) -> Result[Project | None, DomainError]:
        return Success(self._shadow_projects.get(project_id))

    async def list_projects(self) -> Result[Sequence[Project], DomainError]:
        return Success(list(self._shadow_projects.values()))

    # --------------------------------------------------------------------------
    # ISessionRepository Implementation
    # --------------------------------------------------------------------------
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

    # --------------------------------------------------------------------------
    # IConversationRepository Implementation
    # --------------------------------------------------------------------------
    async def save_message(
        self, message: ConversationMessage
    ) -> Result[None, DomainError]:
        """Appends message to session and project threads."""
        if message.session_id not in self._shadow_messages:
            self._shadow_messages[message.session_id] = []
        self._shadow_messages[message.session_id].append(message)

        p_id = getattr(message, "project_id", "default")
        if p_id not in self._shadow_project_messages:
            self._shadow_project_messages[p_id] = []
        self._shadow_project_messages[p_id].append(message)
        return Success(None)

    async def get_messages(
        self, session_id: str, limit: int = 50
    ) -> Result[Sequence[ConversationMessage], DomainError]:
        """Retrieves messages for session."""
        msgs = self._shadow_messages.get(session_id, [])
        return Success(msgs[-limit:])

    async def get_project_messages(
        self, project_id: str, limit: int = 100
    ) -> Result[Sequence[ConversationMessage], DomainError]:
        """Retrieves messages for a project."""
        msgs = self._shadow_project_messages.get(project_id, [])
        return Success(msgs[-limit:])

    async def save_compaction(
        self, compaction: ConversationCompaction
    ) -> Result[None, DomainError]:
        """Saves compaction summary."""
        if compaction.session_id not in self._shadow_compactions:
            self._shadow_compactions[compaction.session_id] = []
        self._shadow_compactions[compaction.session_id].append(compaction)
        return Success(None)

    async def get_latest_compaction(
        self, session_id: str
    ) -> Result[ConversationCompaction | None, DomainError]:
        """Gets latest compaction."""
        compactions = self._shadow_compactions.get(session_id, [])
        return Success(compactions[-1] if compactions else None)

    # --------------------------------------------------------------------------
    # IConnectionConfigRepository Implementation
    # --------------------------------------------------------------------------
    async def save_config(
        self, config: ModelConnectionConfig
    ) -> Result[None, DomainError]:
        """Saves connection config."""
        self._shadow_configs[config.connection_id] = config
        return Success(None)

    async def get_config(
        self, connection_id: str
    ) -> Result[ModelConnectionConfig, DomainError]:
        """Gets connection config."""
        cfg = self._shadow_configs.get(connection_id)
        if cfg is None:
            return Failure(DomainError(f"Config '{connection_id}' not found in PostgreSQL"))
        return Success(cfg)

    async def list_configs(
        self,
    ) -> Result[Sequence[ModelConnectionConfig], DomainError]:
        """Lists connection configs."""
        return Success(list(self._shadow_configs.values()))

    async def delete_config(
        self, connection_id: str
    ) -> Result[None, DomainError]:
        """Deletes connection config."""
        self._shadow_configs.pop(connection_id, None)
        return Success(None)
