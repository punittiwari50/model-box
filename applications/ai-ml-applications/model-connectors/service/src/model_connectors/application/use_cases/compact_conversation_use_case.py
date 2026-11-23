"""Conversation Compaction Use Case adhering to STD-COD-007.2 and STD-COD-007.3.

Compactly summarizes older conversational turns when context exceeds configured token budget.
"""

from datetime import datetime, timezone
from typing import Sequence
import uuid

from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.models.conversation import (
    ConversationCompaction,
    ConversationMessage,
)
from model_connectors.domain.ports.repositories import IConversationRepository
from model_connectors.domain.results.result import Failure, Result, Success


class CompactConversationUseCase:
    """Evaluates message history and applies semantic summarization compaction."""

    def __init__(
        self,
        conversation_repo: IConversationRepository,
        token_threshold: int = 4_000,
    ) -> None:
        self._repo = conversation_repo
        self._token_threshold = token_threshold

    def calculate_total_tokens(self, messages: Sequence[ConversationMessage]) -> int:
        """Calculates total tokens across message list."""
        return sum(m.token_count for m in messages)

    async def execute(
        self, session_id: str, force: bool = False
    ) -> Result[ConversationCompaction | None, DomainError]:
        """Checks session history against budget threshold and generates compaction if needed."""
        history_res = await self._repo.get_messages(session_id, limit=100)
        if history_res.is_failure:
            return Failure(history_res.error)

        messages = history_res.unwrap()
        total_tokens = self.calculate_total_tokens(messages)

        if not force and (len(messages) < 6 or total_tokens < self._token_threshold):
            # No compaction required yet
            return Success(None)

        # Retain the most recent 2 messages for immediate conversational context; compact earlier messages
        to_compact = messages[:-2] if len(messages) > 2 else messages
        original_tokens = sum(m.token_count for m in to_compact)

        # Generate structured compact summary
        bullet_points = [
            f"- [{m.role.value}] {m.content[:140]}..."
            if len(m.content) > 140
            else f"- [{m.role.value}] {m.content}"
            for m in to_compact
        ]
        summary_content = (
            f"Compacted summary of {len(to_compact)} prior turns:\n"
            + "\n".join(bullet_points)
        )
        compacted_tokens = max(1, len(summary_content.split()))
        ratio = (
            compacted_tokens / original_tokens
            if original_tokens > 0
            else 1.0
        )

        compaction = ConversationCompaction(
            compaction_id=f"cmp-{uuid.uuid4().hex[:10]}",
            session_id=session_id,
            summary_content=summary_content,
            compacted_message_ids=tuple(m.message_id for m in to_compact),
            original_token_count=original_tokens,
            compacted_token_count=compacted_tokens,
            compaction_ratio=ratio,
            timestamp=datetime.now(timezone.utc),
        )

        save_res = await self._repo.save_compaction(compaction)
        if save_res.is_failure:
            return Failure(save_res.error)

        return Success(compaction)
