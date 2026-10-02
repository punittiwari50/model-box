"""Microservices Distributed System Pattern: Circuit Breaker adhering to STD-COD-005.

Prevents cascading failures in distributed environments across microservices and model backends.
States:
- CLOSED: Normal operation, routing requests.
- OPEN: Failure threshold exceeded, fast-failing requests immediately.
- HALF_OPEN: Recovery trial period, testing a limited sample of requests.
"""

from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from enum import Enum, unique
import time
from typing import Any, TypeVar

from model_connectors.domain.constants import ErrorConstants
from model_connectors.domain.exceptions.errors import DomainError, ModelConnectionError
from model_connectors.domain.results.result import Failure, Result

T = TypeVar("T")


@unique
class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    recovery_timeout_seconds: float = 30.0
    half_open_sample_size: int = 2


class CircuitBreaker:
    """Enterprise stateful circuit breaker for remote model endpoints."""

    def __init__(
        self,
        name: str,
        config: CircuitBreakerConfig | None = None,
    ) -> None:
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._last_state_change = time.monotonic()
        self._last_failure_time = 0.0

    @property
    def state(self) -> CircuitState:
        # Check if OPEN duration has passed recovery timeout to transition to HALF_OPEN
        if self._state == CircuitState.OPEN:
            elapsed = time.monotonic() - self._last_state_change
            if elapsed >= self.config.recovery_timeout_seconds:
                self._transition_to(CircuitState.HALF_OPEN)
        return self._state

    def _transition_to(self, new_state: CircuitState) -> None:
        self._state = new_state
        self._last_state_change = time.monotonic()
        if new_state == CircuitState.HALF_OPEN:
            self._consecutive_successes = 0
        elif new_state == CircuitState.CLOSED:
            self._consecutive_failures = 0

    def record_success(self) -> None:
        if self._state == CircuitState.HALF_OPEN:
            self._consecutive_successes += 1
            if self._consecutive_successes >= self.config.half_open_sample_size:
                self._transition_to(CircuitState.CLOSED)
        elif self._state == CircuitState.CLOSED:
            self._consecutive_failures = 0

    def record_failure(self) -> None:
        self._last_failure_time = time.monotonic()
        if self._state == CircuitState.HALF_OPEN:
            self._transition_to(CircuitState.OPEN)
        elif self._state == CircuitState.CLOSED:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.config.failure_threshold:
                self._transition_to(CircuitState.OPEN)

    def is_call_permitted(self) -> bool:
        return self.state != CircuitState.OPEN

    async def execute(
        self,
        operation: Callable[[], Coroutine[Any, Any, Result[T, DomainError]]],
    ) -> Result[T, DomainError]:
        """Wraps async invocation with circuit breaker state management."""
        if not self.is_call_permitted():
            return Failure(
                ModelConnectionError(
                    f"Circuit breaker '{self.name}' is OPEN. Remote service temporarily tripped.",
                    {
                        "circuit_name": self.name,
                        "error_code": ErrorConstants.ERR_CIRCUIT_OPEN,
                        "state": self._state.value,
                    },
                )
            )

        try:
            result = await operation()
            if result.is_success:
                self.record_success()
            else:
                self.record_failure()
            return result
        except Exception as exc:
            self.record_failure()
            return Failure(
                ModelConnectionError(
                    f"Circuit breaker captured unhandled exception: {exc}",
                    {"circuit_name": self.name, "exception": str(exc)},
                )
            )
