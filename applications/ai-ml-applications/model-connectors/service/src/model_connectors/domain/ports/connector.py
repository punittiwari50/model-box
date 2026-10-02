"""Port definition for model connectors adhering to STD-COD-005 (Program to interfaces)."""

from collections.abc import AsyncIterator
from typing import Any, Protocol, runtime_checkable

from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.inference import (
    HealthStatus,
    InferenceRequest,
    InferenceResponse,
)
from model_connectors.domain.models.media import MediaAsset, MediaRequest
from model_connectors.domain.results.result import Result


@runtime_checkable
class IModelConnector(Protocol):
    """Core port contract for AI model communication."""

    async def execute_inference(
        self,
        request: InferenceRequest,
        config: ModelConnectionConfig,
    ) -> Result[InferenceResponse, DomainError]:
        """Executes inference via the specific protocol adapter."""
        ...

    async def check_health(
        self,
        config: ModelConnectionConfig,
    ) -> Result[HealthStatus, DomainError]:
        """Probes connectivity and latency of the target endpoint."""
        ...

    async def list_models(
        self,
        config: ModelConnectionConfig,
    ) -> Result[list[dict[str, Any]], DomainError]:
        """Discovers available models or checkpoints hosted at the target endpoint."""
        ...


@runtime_checkable
class IMediaStreamingConnector(Protocol):
    """Port extension for viewing static images and streaming video frames."""

    async def view_image(
        self,
        request: MediaRequest,
        config: ModelConnectionConfig,
    ) -> Result[MediaAsset, DomainError]:
        """Retrieves or renders an image artifact with MIME metadata."""
        ...

    async def stream_video(
        self,
        request: MediaRequest,
        config: ModelConnectionConfig,
    ) -> AsyncIterator[bytes]:
        """Asynchronously streams binary video chunks for real-time playback."""
        ...


@runtime_checkable
class IUniversalModelConnector(IModelConnector, IMediaStreamingConnector, Protocol):
    """Unified client contract supporting REST, gRPC, WebSocket, Kafka, and multimedia."""

    async def stream_events(
        self,
        request: InferenceRequest,
        config: ModelConnectionConfig,
    ) -> AsyncIterator[dict[str, Any]]:
        """Asynchronously yields real-time streaming tokens or workflow events."""
        ...
