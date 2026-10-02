"""Unit tests for SQLite In-Memory Persistence repository."""

from datetime import datetime, timezone
import pytest

from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.conversation import (
    ConversationCompaction,
    ConversationMessage,
)
from model_connectors.domain.models.enums import (
    ConnectionProtocol,
    MessageRole,
    StorageBackend,
)
from model_connectors.domain.models.session import ConversationSession
from model_connectors.infrastructure.persistence.in_memory.sqlite_repository import (
    InMemorySqliteRepository,
)


@pytest.mark.asyncio
async def test_session_lifecycle() -> None:
    repo = InMemorySqliteRepository(":memory:")
    now = datetime.now(timezone.utc)
    session = ConversationSession(
        session_id="sess-test-01",
        user_id="user-alice",
        cookie_id="cookie-xyz-99",
        created_at=now,
        updated_at=now,
        metadata={"client": "web"},
    )

    save_res = await repo.save_session(session)
    assert save_res.is_success

    fetch_res = await repo.get_session("sess-test-01")
    assert fetch_res.is_success
    s = fetch_res.unwrap()
    assert s.session_id == "sess-test-01"
    assert s.user_id == "user-alice"
    assert s.cookie_id == "cookie-xyz-99"
    assert s.metadata.get("client") == "web"


@pytest.mark.asyncio
async def test_message_and_compaction_persistence() -> None:
    repo = InMemorySqliteRepository(":memory:")
    now = datetime.now(timezone.utc)

    # 1. Create parent session
    session = ConversationSession(
        session_id="sess-chat-01",
        user_id="user-bob",
        cookie_id="cookie-bob-12",
        created_at=now,
        updated_at=now,
    )
    await repo.save_session(session)

    # 2. Append messages
    msg1 = ConversationMessage(
        message_id="msg-1",
        session_id="sess-chat-01",
        role=MessageRole.USER,
        content="Hello Ollama",
        token_count=3,
        timestamp=now,
    )
    msg2 = ConversationMessage(
        message_id="msg-2",
        session_id="sess-chat-01",
        role=MessageRole.ASSISTANT,
        content="Hello! How can I assist you today?",
        token_count=8,
        timestamp=now,
    )
    await repo.save_message(msg1)
    await repo.save_message(msg2)

    msgs_res = await repo.get_messages("sess-chat-01", limit=10)
    assert msgs_res.is_success
    msgs = msgs_res.unwrap()
    assert len(msgs) == 2

    # 3. Save compaction
    compaction = ConversationCompaction(
        compaction_id="cmp-01",
        session_id="sess-chat-01",
        summary_content="User greeted assistant.",
        compacted_message_ids=("msg-1", "msg-2"),
        original_token_count=11,
        compacted_token_count=4,
        compaction_ratio=0.36,
        timestamp=now,
    )
    await repo.save_compaction(compaction)

    latest_cmp = await repo.get_latest_compaction("sess-chat-01")
    assert latest_cmp.is_success
    assert latest_cmp.unwrap() is not None
    assert latest_cmp.unwrap().summary_content == "User greeted assistant."
