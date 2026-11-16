"""Token consumption, bucket metrics, and refill wait time value objects.

Adheres to STD-COD-007.5 (Immutability by default).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class TokenMetrics:
    """Immutable representation of token consumption and bucket availability."""

    tokens_consumed_total: int
    tokens_consumed_request: int
    tokens_available: int
    bucket_capacity: int
    refill_rate_per_second: float
    wait_time_seconds: float
    is_throttled: bool
    last_refill_timestamp: float

    @property
    def percentage_available(self) -> float:
        """Calculates percentage of remaining token capacity."""
        if self.bucket_capacity <= 0:
            return 0.0
        return max(0.0, min(100.0, (self.tokens_available / self.bucket_capacity) * 100.0))

    @property
    def wait_time_display(self) -> str:
        """Formatted wait time string for display."""
        if self.wait_time_seconds <= 0:
            return "0s (Ready)"
        return f"{self.wait_time_seconds:.1f}s"
