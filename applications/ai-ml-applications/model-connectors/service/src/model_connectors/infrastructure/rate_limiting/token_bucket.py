"""Thread-safe Token Bucket Rate Limiter implementation fulfilling ITokenLimiter.

Meets user requirement #6: tracks tokens consumed, tokens available, and wait time for bucket replenishment.
"""

from dataclasses import dataclass
import threading
import time

from model_connectors.domain.exceptions.errors import (
    DomainError,
    RateLimitExceededError,
)
from model_connectors.domain.models.token_metrics import TokenMetrics
from model_connectors.domain.ports.limiter import ITokenLimiter
from model_connectors.domain.results.result import Failure, Result, Success


@dataclass
class _BucketState:
    """Internal mutable state for an individual model connection bucket."""

    capacity: int
    refill_rate_per_second: float
    current_tokens: float
    tokens_consumed_total: int
    last_request_tokens: int
    last_refill_timestamp: float


class TokenBucketLimiter(ITokenLimiter):
    """High-precision token bucket rate limiter and wait-time estimator."""

    def __init__(
        self,
        default_capacity: int = 100_000,
        default_refill_rate_per_sec: float = 1_000.0,
    ) -> None:
        self._default_capacity = default_capacity
        self._default_refill_rate = default_refill_rate_per_sec
        self._buckets: dict[str, _BucketState] = {}
        self._lock = threading.Lock()

    def _get_or_create_bucket(self, connection_id: str) -> _BucketState:
        """Retrieves existing bucket or initializes one with default properties."""
        if connection_id not in self._buckets:
            now = time.monotonic()
            self._buckets[connection_id] = _BucketState(
                capacity=self._default_capacity,
                refill_rate_per_second=self._default_refill_rate,
                current_tokens=float(self._default_capacity),
                tokens_consumed_total=0,
                last_request_tokens=0,
                last_refill_timestamp=now,
            )
        return self._buckets[connection_id]

    def _refill_tokens(self, state: _BucketState, now: float) -> None:
        """Calculates token accrual since last check."""
        elapsed = now - state.last_refill_timestamp
        if elapsed > 0:
            accrued = elapsed * state.refill_rate_per_second
            state.current_tokens = min(float(state.capacity), state.current_tokens + accrued)
            state.last_refill_timestamp = now

    def acquire(
        self, connection_id: str, tokens_requested: int
    ) -> Result[TokenMetrics, RateLimitExceededError]:
        """Attempts to reserve tokens. If insufficient, returns failure with required wait time."""
        with self._lock:
            state = self._get_or_create_bucket(connection_id)
            now = time.monotonic()
            self._refill_tokens(state, now)

            if state.current_tokens >= tokens_requested:
                state.current_tokens -= float(tokens_requested)
                state.tokens_consumed_total += tokens_requested
                state.last_request_tokens = tokens_requested
                metrics = TokenMetrics(
                    tokens_consumed_total=state.tokens_consumed_total,
                    tokens_consumed_request=tokens_requested,
                    tokens_available=int(state.current_tokens),
                    bucket_capacity=state.capacity,
                    refill_rate_per_second=state.refill_rate_per_second,
                    wait_time_seconds=0.0,
                    is_throttled=False,
                    last_refill_timestamp=state.last_refill_timestamp,
                )
                return Success(metrics)

            deficit = float(tokens_requested) - state.current_tokens
            wait_time = deficit / max(0.1, state.refill_rate_per_second)
            return Failure(
                RateLimitExceededError(
                    message=(
                        f"Rate limit exceeded for connection '{connection_id}'. "
                        f"Requested {tokens_requested} tokens, available {int(state.current_tokens)}. "
                        f"Wait {wait_time:.2f}s for bucket refill."
                    ),
                    wait_time_seconds=wait_time,
                    tokens_requested=tokens_requested,
                    tokens_available=int(state.current_tokens),
                )
            )

    def record_consumption(
        self, connection_id: str, actual_tokens: int
    ) -> Result[TokenMetrics, DomainError]:
        """Adjusts bucket counters when actual token usage differs from initial reservation."""
        with self._lock:
            state = self._get_or_create_bucket(connection_id)
            now = time.monotonic()
            self._refill_tokens(state, now)
            # Adjust difference between estimated and actual
            diff = actual_tokens - state.last_request_tokens
            if diff > 0:
                state.current_tokens = max(0.0, state.current_tokens - float(diff))
                state.tokens_consumed_total += diff
            elif diff < 0:
                # Refund over-estimated tokens
                state.current_tokens = min(float(state.capacity), state.current_tokens + float(abs(diff)))
                state.tokens_consumed_total -= abs(diff)

            state.last_request_tokens = actual_tokens
            metrics = TokenMetrics(
                tokens_consumed_total=state.tokens_consumed_total,
                tokens_consumed_request=actual_tokens,
                tokens_available=int(state.current_tokens),
                bucket_capacity=state.capacity,
                refill_rate_per_second=state.refill_rate_per_second,
                wait_time_seconds=0.0,
                is_throttled=False,
                last_refill_timestamp=state.last_refill_timestamp,
            )
            return Success(metrics)

    def get_metrics(
        self, connection_id: str
    ) -> Result[TokenMetrics, DomainError]:
        """Inspects current tokens consumed, available tokens, and wait time for refill."""
        with self._lock:
            state = self._get_or_create_bucket(connection_id)
            now = time.monotonic()
            self._refill_tokens(state, now)

            deficit_to_full = float(state.capacity) - state.current_tokens
            wait_time_to_full = deficit_to_full / max(0.1, state.refill_rate_per_second)
            metrics = TokenMetrics(
                tokens_consumed_total=state.tokens_consumed_total,
                tokens_consumed_request=state.last_request_tokens,
                tokens_available=int(state.current_tokens),
                bucket_capacity=state.capacity,
                refill_rate_per_second=state.refill_rate_per_second,
                wait_time_seconds=max(0.0, wait_time_to_full),
                is_throttled=(state.current_tokens < 100),
                last_refill_timestamp=state.last_refill_timestamp,
            )
            return Success(metrics)
