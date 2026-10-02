"""Token Metrics and Rate Limit Query Use Case adhering to STD-COD-007.2 and STD-COD-007.3."""

from model_connectors.application.dto.inference_dto import TokenStatusDTO
from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.ports.limiter import ITokenLimiter
from model_connectors.domain.results.result import Failure, Result, Success


class TokenMetricsUseCase:
    """Queries real-time token bucket state, tokens consumed, available tokens, and refill wait time."""

    def __init__(self, limiter: ITokenLimiter) -> None:
        self._limiter = limiter

    def get_token_status(
        self, connection_id: str
    ) -> Result[TokenStatusDTO, DomainError]:
        """Fetches current token bucket state for a model connection."""
        res = self._limiter.get_metrics(connection_id)
        if res.is_failure:
            return Failure(res.error)

        m = res.unwrap()
        dto = TokenStatusDTO(
            connection_id=connection_id,
            tokens_consumed_total=m.tokens_consumed_total,
            tokens_consumed_request=m.tokens_consumed_request,
            tokens_available=m.tokens_available,
            bucket_capacity=m.bucket_capacity,
            percentage_available=m.percentage_available,
            refill_rate_per_sec=m.refill_rate_per_second,
            wait_time_seconds=m.wait_time_seconds,
            wait_time_display=m.wait_time_display,
            is_throttled=m.is_throttled,
        )
        return Success(dto)
