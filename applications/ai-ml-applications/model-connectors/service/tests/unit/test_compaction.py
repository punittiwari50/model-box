"""Unit tests for conversation compaction use case."""

from datetime import datetime, timezone
import pytest

from model_connectors.application.use_cases.compact_conversation_use_case import (
    CompactConversationUseCase,
)
from model_connectors.domain.models.conversation import ConversationMessage
from model_connectors.domain.models.enums import MessageRole
from model_connectors.domain.models.session import ConversationSession
from model_connectors.infrastructure.persistence.in_memory.sqlite_repository import (
    InMemorySqliteRepository,
)


@pytest.mark.asyncio
async def test_conversation_compaction_flow() -> None:
    repo = InMemorySqliteRepository(":memory:")
    now = datetime.now(timezone.utc)
    sess_id = "sess-compact-test"

    await repo.save_session(
        ConversationSession(
            session_id=sess_id,
            user_id="user-1",
            cookie_id="cookie-1",
            created_at=now,
            updated_at=now,
        )
    )

    # Add multiple messages
    for i in range(8):
        await repo.save_message(
            ConversationMessage(
                message_id=f"msg-{i}",
                session_id=sess_id,
                role=MessageRole.USER if i % 2 == 0 else MessageRole.ASSISTANT,
                content=f"Message turn number {i} discussing architectural requirements.",
                token_count=10,
                timestamp=now,
            )
        )

    use_case = CompactConversationUseCase(conversation_repo=repo, token_threshold=50)
    res = await use_case.execute(sess_id, force=True)
    assert res.is_success
    compaction = res.unwrap()
    assert compaction is not None
    assert compaction.original_token_count > 0
    assert compaction.compacted_token_count > 0
    assert len(compaction.compacted_message_ids) > 0
