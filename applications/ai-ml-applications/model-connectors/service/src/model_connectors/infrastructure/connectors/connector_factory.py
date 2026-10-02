"""Creational Factory for Model Connectors adhering to STD-COD-005 (GoF Factory Pattern)."""

from typing import Mapping

from model_connectors.domain.exceptions.errors import ConfigurationError, DomainError
from model_connectors.domain.models.enums import ConnectionProtocol
from model_connectors.domain.ports.connector import IModelConnector, IUniversalModelConnector
from model_connectors.domain.results.result import Failure, Result, Success
from model_connectors.infrastructure.connectors.cookie_session_connector import (
    CookieSessionConnector,
)
from model_connectors.infrastructure.connectors.grpc_connector import GrpcModelConnector
from model_connectors.infrastructure.connectors.kafka_connector import KafkaModelConnector
from model_connectors.infrastructure.connectors.rest_ollama_connector import (
    RestOllamaConnector,
)
from model_connectors.infrastructure.connectors.universal.universal_connector import (
    UniversalModelConnector,
)
from model_connectors.infrastructure.connectors.websocket_comfyui_connector import (
    WebSocketComfyUIConnector,
)


class ModelConnectorFactory:
    """Factory creating and caching protocol-specific model connectors."""

    def __init__(self) -> None:
        self._universal_connector = UniversalModelConnector()
        self._instances: dict[ConnectionProtocol, IModelConnector] = {
            ConnectionProtocol.REST: RestOllamaConnector(),
            ConnectionProtocol.WEBSOCKET: WebSocketComfyUIConnector(),
            ConnectionProtocol.GRPC: GrpcModelConnector(),
            ConnectionProtocol.KAFKA: KafkaModelConnector(),
            ConnectionProtocol.COOKIE_SESSION: CookieSessionConnector(),
        }

    def register_connector(
        self, protocol: ConnectionProtocol, connector: IModelConnector
    ) -> None:
        """Registers a custom connector implementation for a given protocol."""
        self._instances[protocol] = connector
        self._universal_connector.register_protocol_strategy(protocol, connector)

    def get_connector(
        self, protocol: ConnectionProtocol
    ) -> Result[IModelConnector, DomainError]:
        """Resolves the concrete connector implementation for the requested protocol."""
        connector = self._instances.get(protocol)
        if connector is None:
            return Failure(
                ConfigurationError(
                    f"No connector registered for protocol '{protocol.value}'",
                    {"protocol": protocol.value},
                )
            )
        return Success(connector)

    def get_universal_connector(self) -> IUniversalModelConnector:
        """Returns the unified omni-channel connector client."""
        return self._universal_connector
