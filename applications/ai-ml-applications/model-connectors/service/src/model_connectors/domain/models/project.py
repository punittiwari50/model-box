"""Project entity model adhering to STD-COD-007.5 and Enterprise Domain Driven Design."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping


@dataclass(frozen=True)
class Project:
    """Immutable domain entity representing an enterprise model-box project workspace."""

    project_id: str
    name: str
    description: str
    tags: tuple[str, ...] = field(default_factory=tuple)
    assigned_users: tuple[str, ...] = field(default_factory=tuple)
    system_prompt: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Mapping[str, Any] = field(default_factory=dict)
