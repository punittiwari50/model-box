"""Inference request and response value objects adhering to STD-COD-007.5."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

from model_connectors.domain.models.enums import ConnectorHealthState
from model_connectors.domain.models.token_metrics import TokenMetrics


@dataclass(frozen=True)
class InferenceRequest:
    """Immutable input DTO for executing model inference."""

    session_id: str
    user_id: str
    cookie_id: str
    prompt: str
    model_name: str
    connection_id: str
    parameters: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class InferenceResponse:
    """Immutable output value object with generated content and token accounting."""

    response_id: str
    session_id: str
    content: str
    token_metrics: TokenMetrics
    execution_duration_ms: float
    raw_payload: Mapping[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class HealthStatus:
    """Connector operational health status report."""

    connection_id: str
    state: ConnectorHealthState
    latency_ms: float
    details: Mapping[str, str] = field(default_factory=dict)
