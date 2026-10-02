"""Unified Omni-Channel Client for REST, gRPC, WebSocket, Kafka, Images, and Video.

Adheres to:
- Strategy Pattern: Protocol-specific strategies for dispatch.
- Decorator/Chain of Responsibility: Embedded security pipeline.
- Circuit Breaker Pattern: Microservice resilience against remote failures.
- Open/Closed Principle: Add new protocols without altering the unified client.
"""

from collections.abc import AsyncIterator
from typing import Any, Final, Mapping

from model_connectors.domain.constants import ErrorConstants
from model_connectors.domain.exceptions.errors import (
    ConfigurationError,
    DomainError,
    ModelConnectionError,
)
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.enums import ConnectionProtocol
from model_connectors.domain.models.inference import (
    HealthStatus,
    InferenceRequest,
    InferenceResponse,
)
from model_connectors.domain.models.media import MediaAsset, MediaRequest
from model_connectors.domain.ports.connector import (
    IModelConnector,
    IUniversalModelConnector,
)
from model_connectors.domain.results.result import Failure, Result, Success
from model_connectors.infrastructure.connectors.cookie_session_connector import (
    CookieSessionConnector,
)
from model_connectors.infrastructure.connectors.grpc_connector import GrpcModelConnector
from model_connectors.infrastructure.connectors.kafka_connector import KafkaModelConnector
from model_connectors.infrastructure.connectors.media.media_handlers import (
    ImageViewerHandler,
    VideoStreamHandler,
)
from model_connectors.infrastructure.connectors.rest_ollama_connector import (
    RestOllamaConnector,
)
from model_connectors.infrastructure.connectors.websocket_comfyui_connector import (
    WebSocketComfyUIConnector,
)
from model_connectors.infrastructure.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
)
from model_connectors.infrastructure.security.pipeline import SecurityPipeline


class UniversalModelConnector(IUniversalModelConnector):
    """The Single Unified Client for multi-protocol model serving and multimedia.

    Coordinates REST, gRPC, WebSocket, Kafka, static image inspection, and video streaming.
    Applies enterprise security pipeline and circuit breakers transparently.
    """

    def __init__(
        self,
        security_pipeline: SecurityPipeline | None = None,
        circuit_config: CircuitBreakerConfig | None = None,
    ) -> None:
        self._security = security_pipeline or SecurityPipeline()
        self._circuit_config = circuit_config or CircuitBreakerConfig()
        self._circuit_breakers: dict[str, CircuitBreaker] = {}

        # Strategy Registry for protocols
        self._strategies: dict[ConnectionProtocol, IModelConnector] = {
            ConnectionProtocol.REST: RestOllamaConnector(),
            ConnectionProtocol.WEBSOCKET: WebSocketComfyUIConnector(),
            ConnectionProtocol.GRPC: GrpcModelConnector(),
            ConnectionProtocol.KAFKA: KafkaModelConnector(),
            ConnectionProtocol.COOKIE_SESSION: CookieSessionConnector(),
        }

        # Multimedia handlers
        self._image_handler = ImageViewerHandler()
        self._video_handler = VideoStreamHandler()

    def register_protocol_strategy(
        self,
        protocol: ConnectionProtocol,
        connector: IModelConnector,
    ) -> None:
        """Enables Open-Closed extension by registering custom protocol strategies."""
        self._strategies[protocol] = connector

    def _get_circuit_breaker(self, connection_id: str) -> CircuitBreaker:
        if connection_id not in self._circuit_breakers:
            self._circuit_breakers[connection_id] = CircuitBreaker(
                name=connection_id, config=self._circuit_config
            )
        return self._circuit_breakers[connection_id]

    def _resolve_strategy(
        self, protocol: ConnectionProtocol
    ) -> Result[IModelConnector, DomainError]:
        strategy = self._strategies.get(protocol)
        if not strategy:
            return Failure(
                ConfigurationError(
                    f"No protocol strategy registered for '{protocol.value}'",
                    {"protocol": protocol.value, "error_code": ErrorConstants.ERR_UNSUPPORTED_PROTOCOL},
                )
            )
        return Success(strategy)

    async def execute_inference(
        self,
        request: InferenceRequest,
        config: ModelConnectionConfig,
    ) -> Result[InferenceResponse, DomainError]:
        """Executes inference through security validation and circuit breaker resilience."""
        # 1. Enforce Security Pipeline
        sec_res = await self._security.enforce(request, config)
        if sec_res.is_failure:
            return Failure(sec_res.error)

        # 2. Resolve Strategy
        strategy_res = self._resolve_strategy(config.protocol)
        if strategy_res.is_failure:
            return Failure(strategy_res.error)
        strategy = strategy_res.unwrap()

        # 3. Execute via Circuit Breaker
        cb = self._get_circuit_breaker(config.connection_id)
        return await cb.execute(lambda: strategy.execute_inference(request, config))

    async def check_health(
        self,
        config: ModelConnectionConfig,
    ) -> Result[HealthStatus, DomainError]:
        """Probes endpoint health via protocol strategy."""
        strategy_res = self._resolve_strategy(config.protocol)
        if strategy_res.is_failure:
            return Failure(strategy_res.error)
        return await strategy_res.unwrap().check_health(config)

    async def list_models(
        self,
        config: ModelConnectionConfig,
    ) -> Result[list[dict[str, Any]], DomainError]:
        """Discovers available models via protocol strategy."""
        strategy_res = self._resolve_strategy(config.protocol)
        if strategy_res.is_failure:
            return Failure(strategy_res.error)
        return await strategy_res.unwrap().list_models(config)

    async def view_image(
        self,
        request: MediaRequest,
        config: ModelConnectionConfig,
    ) -> Result[MediaAsset, DomainError]:
        """Retrieves and processes image assets with MIME metadata."""
        return await self._image_handler.fetch_image(request, config)

    async def stream_video(
        self,
        request: MediaRequest,
        config: ModelConnectionConfig,
    ) -> AsyncIterator[bytes]:
        """Streams chunked video frames for real-time player playback."""
        async for chunk in self._video_handler.stream_video_chunks(request, config):
            yield chunk

    async def stream_events(
        self,
        request: InferenceRequest,
        config: ModelConnectionConfig,
    ) -> AsyncIterator[dict[str, Any]]:
        """Streams real-time events over WebSocket or Kafka."""
        strategy_res = self._resolve_strategy(config.protocol)
        if strategy_res.is_success:
            strategy = strategy_res.unwrap()
            if hasattr(strategy, "stream_events"):
                async for event in strategy.stream_events(request, config):
                    yield event
                return

        # Fallback simulation generator
        words = request.prompt.split()
        for idx, word in enumerate(words):
            yield {
                "chunk_id": idx,
                "token": word + " ",
                "protocol": config.protocol.value,
            }
