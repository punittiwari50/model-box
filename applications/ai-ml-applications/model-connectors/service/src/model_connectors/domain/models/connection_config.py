"""Model connection configuration domain model adhering to STD-COD-007.5."""

from dataclasses import dataclass, field
from typing import Mapping

from model_connectors.domain.models.enums import (
    AuthMethod,
    ConnectionProtocol,
    StorageBackend,
)


@dataclass(frozen=True)
class ModelConnectionConfig:
    """Immutable configuration entity for connecting to an AI model endpoint."""

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
