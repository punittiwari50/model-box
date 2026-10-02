"""Media representation domain models for viewing images and streaming video.

Adheres to STD-COD-007 (Value objects and immutability).
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

from model_connectors.domain.constants import MediaConstants


@dataclass(frozen=True)
class MediaRequest:
    """Request value object for viewing an image or requesting video streaming."""

    media_id: str
    media_type: str = "image"  # "image" or "video"
    mime_type: str = MediaConstants.MIME_PNG
    parameters: Mapping[str, Any] = field(default_factory=dict)
    range_header: str | None = None  # HTTP byte range e.g. "bytes=0-1048576"


@dataclass(frozen=True)
class MediaAsset:
    """Immutable binary media asset container for images and video segments."""

    asset_id: str
    mime_type: str
    data: bytes
    size_bytes: int
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class VideoStreamDescriptor:
    """Descriptor providing streaming chunk generator and content headers."""

    stream_id: str
    mime_type: str
    content_length: int
    chunk_size: int
    supports_range: bool = True
