"""Application Data Transfer Objects (DTOs) adhering to STD-COD-007.2 and STD-COD-007.5."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Mapping

from model_connectors.domain.models.enums import (
    AuthMethod,
    ConnectionProtocol,
    ConnectorHealthState,
    MessageRole,
    StorageBackend,
)


@dataclass(frozen=True)
class SessionCreateDTO:
    """Input DTO for initiating a conversational session."""

    user_id: str
    cookie_id: str
    metadata: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class SessionResponseDTO:
    """Output DTO returning session details."""

    session_id: str
    user_id: str
    cookie_id: str
    created_at: str
    updated_at: str
    metadata: Mapping[str, str]


@dataclass(frozen=True)
class InferenceInputDTO:
    """Input DTO for running an inference request."""

    session_id: str
    prompt: str
    connection_id: str
    user_id: str = "default-user"
    cookie_id: str = "default-cookie"
    model_name: str = ""
    parameters: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TokenStatusDTO:
    """DTO presenting token consumption, available capacity, and refill wait time."""

    connection_id: str
    tokens_consumed_total: int
    tokens_consumed_request: int
    tokens_available: int
    bucket_capacity: int
    percentage_available: float
    refill_rate_per_sec: float
    wait_time_seconds: float
    wait_time_display: str
    is_throttled: bool


@dataclass(frozen=True)
class InferenceOutputDTO:
    """Output DTO containing generated text and detailed token audit metrics."""

    response_id: str
    session_id: str
    content: str
    model_name: str
    protocol: str
    execution_duration_ms: float
    token_status: TokenStatusDTO
    timestamp: str


@dataclass(frozen=True)
class ConnectionCreateDTO:
    """Input DTO for creating a new model connection profile."""

    connection_id: str
    name: str
    protocol: ConnectionProtocol
    endpoint_url: str
    model_name: str
    auth_method: AuthMethod = AuthMethod.NONE
    auth_payload: Mapping[str, str] = field(default_factory=dict)
    timeout_seconds: float = 60.0
    max_retries: int = 3
    rate_limit_rpm: int = 60
    token_capacity: int = 100_000
    token_refill_rate_per_sec: float = 1_000.0
    storage_backend: StorageBackend = StorageBackend.IN_MEMORY


@dataclass(frozen=True)
class MessageDTO:
    """DTO representing an individual message."""

    message_id: str
    role: MessageRole
    content: str
    token_count: int
    timestamp: str
    model_name: str
    connector_protocol: str


@dataclass(frozen=True)
class CompactionDTO:
    """DTO representing a compacted conversation summary."""

    compaction_id: str
    summary_content: str
    compacted_message_count: int
    original_token_count: int
    compacted_token_count: int
    compaction_ratio: float
    timestamp: str
