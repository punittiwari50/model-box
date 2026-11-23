"""Session Management Use Case adhering to STD-COD-007.2 and STD-COD-007.3."""

from datetime import datetime, timezone
from typing import Sequence
import uuid

from model_connectors.application.dto.inference_dto import (
    CompactionDTO,
    MessageDTO,
    SessionCreateDTO,
    SessionResponseDTO,
)
from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.models.session import ConversationSession
from model_connectors.domain.ports.repositories import (
    IConversationRepository,
    ISessionRepository,
)
from model_connectors.domain.results.result import Failure, Result, Success


class ManageSessionUseCase:
    """Orchestrates session creation, cookie linkage, and historical thread inspection."""

    def __init__(
        self,
        session_repo: ISessionRepository,
        conversation_repo: IConversationRepository,
    ) -> None:
        self._session_repo = session_repo
        self._conversation_repo = conversation_repo

    async def create_session(
        self, dto: SessionCreateDTO
    ) -> Result[SessionResponseDTO, DomainError]:
        """Creates and persists a new session linked to user_id and cookie_id."""
        now = datetime.now(timezone.utc)
        session_id = f"sess-{uuid.uuid4().hex[:12]}"
        session = ConversationSession(
            session_id=session_id,
            user_id=dto.user_id,
            cookie_id=dto.cookie_id,
            created_at=now,
            updated_at=now,
            metadata=dto.metadata,
        )

        res = await self._session_repo.save_session(session)
        if res.is_failure:
            return Failure(res.error)

        return Success(
            SessionResponseDTO(
                session_id=session.session_id,
                user_id=session.user_id,
                cookie_id=session.cookie_id,
                created_at=session.created_at.isoformat(),
                updated_at=session.updated_at.isoformat(),
                metadata=session.metadata,
            )
        )

    async def get_session(
        self, session_id: str
    ) -> Result[SessionResponseDTO, DomainError]:
        """Fetches session metadata."""
        res = await self._session_repo.get_session(session_id)
        if res.is_failure:
            return Failure(res.error)
        s = res.unwrap()
        return Success(
            SessionResponseDTO(
                session_id=s.session_id,
                user_id=s.user_id,
                cookie_id=s.cookie_id,
                created_at=s.created_at.isoformat(),
                updated_at=s.updated_at.isoformat(),
                metadata=s.metadata,
            )
        )

    async def list_sessions(
        self, user_id: str | None = None
    ) -> Result[Sequence[SessionResponseDTO], DomainError]:
        """Lists sessions optionally filtered by user."""
        res = await self._session_repo.list_sessions(user_id)
        if res.is_failure:
            return Failure(res.error)

        dtos = [
            SessionResponseDTO(
                session_id=s.session_id,
                user_id=s.user_id,
                cookie_id=s.cookie_id,
                created_at=s.created_at.isoformat(),
                updated_at=s.updated_at.isoformat(),
                metadata=s.metadata,
            )
            for s in res.unwrap()
        ]
        return Success(dtos)

    async def get_history(
        self, session_id: str, limit: int = 50
    ) -> Result[Sequence[MessageDTO], DomainError]:
        """Retrieves chronological message history for a session."""
        res = await self._conversation_repo.get_messages(session_id, limit)
        if res.is_failure:
            return Failure(res.error)

        dtos = [
            MessageDTO(
                message_id=m.message_id,
                role=m.role,
                content=m.content,
                token_count=m.token_count,
                timestamp=m.timestamp.isoformat(),
                model_name=m.model_name,
                connector_protocol=m.connector_protocol.value,
            )
            for m in res.unwrap()
        ]
        return Success(dtos)

    async def get_latest_compaction(
        self, session_id: str
    ) -> Result[CompactionDTO | None, DomainError]:
        """Retrieves the latest compacted conversation summary."""
        res = await self._conversation_repo.get_latest_compaction(session_id)
        if res.is_failure:
            return Failure(res.error)

        c = res.unwrap()
        if c is None:
            return Success(None)

        return Success(
            CompactionDTO(
                compaction_id=c.compaction_id,
                summary_content=c.summary_content,
                compacted_message_count=len(c.compacted_message_ids),
                original_token_count=c.original_token_count,
                compacted_token_count=c.compacted_token_count,
                compaction_ratio=c.compaction_ratio,
                timestamp=c.timestamp.isoformat(),
            )
        )
