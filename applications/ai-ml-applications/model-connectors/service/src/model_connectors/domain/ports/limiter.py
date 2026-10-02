"""Token rate-limiter and budget manager port adhering to STD-COD-005."""

from typing import Protocol

from model_connectors.domain.exceptions.errors import (
    DomainError,
    RateLimitExceededError,
)
from model_connectors.domain.models.token_metrics import TokenMetrics
from model_connectors.domain.results.result import Result


class ITokenLimiter(Protocol):
    """Port for rate-limiting, token consumption tracking, and refill prediction."""

    def acquire(
        self, connection_id: str, tokens_requested: int
    ) -> Result[TokenMetrics, RateLimitExceededError]:
        """Attempts to reserve tokens. If insufficient, returns failure with wait time."""
        ...

    def record_consumption(
        self, connection_id: str, actual_tokens: int
    ) -> Result[TokenMetrics, DomainError]:
        """Adjusts bucket state based on actual token count returned by model."""
        ...

    def get_metrics(
        self, connection_id: str
    ) -> Result[TokenMetrics, DomainError]:
        """Inspects current tokens consumed, available tokens, and refill wait time."""
        ...
