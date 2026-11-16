"""User conversation session entity adhering to STD-COD-007.5."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Mapping


@dataclass(frozen=True)
class ConversationSession:
    """Immutable domain entity tracking user session, cookie ID, and lifecycle."""

    session_id: str
    user_id: str
    cookie_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Mapping[str, str] = field(default_factory=dict)
