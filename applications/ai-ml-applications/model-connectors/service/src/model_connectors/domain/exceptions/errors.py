"""Domain exceptions adhering to STD-COD-007.4.

Defines a strict exception hierarchy without unhandled or generic errors.
"""


class DomainError(Exception):
    """Base class for all domain-level exceptions."""

    def __init__(self, message: str, context: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.context = context or {}

    def __str__(self) -> str:
        if not self.context:
            return self.message
        context_str = ", ".join(f"{k}={v}" for k, v in self.context.items())
        return f"{self.message} [{context_str}]"


class ModelConnectionError(DomainError):
    """Raised when communication with an AI model endpoint fails."""


class AuthenticationError(DomainError):
    """Raised when authentication credentials or cookies are invalid."""


class AuthorizationError(DomainError):
    """Raised when caller lacks required role or permission."""


class ValidationError(DomainError):
    """Raised when request payload or parameters fail validation."""


class RateLimitExceededError(DomainError):
    """Raised when token quota or request limit has been exhausted."""

    def __init__(
        self,
        message: str,
        wait_time_seconds: float,
        tokens_requested: int,
        tokens_available: int,
    ) -> None:
        super().__init__(
            message,
            {
                "wait_time_seconds": f"{wait_time_seconds:.2f}",
                "tokens_requested": str(tokens_requested),
                "tokens_available": str(tokens_available),
            },
        )
        self.wait_time_seconds = wait_time_seconds
        self.tokens_requested = tokens_requested
        self.tokens_available = tokens_available


class SessionNotFoundError(DomainError):
    """Raised when a referenced session id does not exist."""


class ConfigurationError(DomainError):
    """Raised when a connectivity or storage configuration is invalid."""


class CompactionError(DomainError):
    """Raised when conversation compaction fails."""
