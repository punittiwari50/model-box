"""Conversation message and compact summary entities adhering to STD-COD-007.5."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Mapping

from model_connectors.domain.models.enums import ConnectionProtocol, MessageRole


@dataclass(frozen=True)
class ConversationMessage:
    """Immutable domain entity representing an individual chat or inference message."""

    message_id: str
    session_id: str
    role: MessageRole
    content: str
    token_count: int
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    model_name: str = "default"
    connector_protocol: ConnectionProtocol = ConnectionProtocol.REST
    metadata: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ConversationCompaction:
    """Immutable domain entity representing a compacted history summary."""

    compaction_id: str
    session_id: str
    summary_content: str
    compacted_message_ids: tuple[str, ...]
    original_token_count: int
    compacted_token_count: int
    compaction_ratio: float
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
