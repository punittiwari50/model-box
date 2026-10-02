"""Domain enumerations for model connectors adhering to STD-COD-007.1."""

from enum import Enum, unique


@unique
class ConnectionProtocol(str, Enum):
    """Supported communication protocols for AI models."""

    REST = "REST"
    WEBSOCKET = "WEBSOCKET"
    GRPC = "GRPC"
    KAFKA = "KAFKA"
    COOKIE_SESSION = "COOKIE_SESSION"


@unique
class AuthMethod(str, Enum):
    """Authentication and credential injection techniques."""

    NONE = "NONE"
    API_KEY = "API_KEY"
    BEARER_TOKEN = "BEARER_TOKEN"
    COOKIE = "COOKIE"
    MUTUAL_TLS = "MUTUAL_TLS"
    HMAC = "HMAC"


@unique
class MessageRole(str, Enum):
    """Standard message roles in conversational context."""

    SYSTEM = "SYSTEM"
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    TOOL = "TOOL"


@unique
class StorageBackend(str, Enum):
    """Pluggable persistence storage engines."""

    IN_MEMORY = "IN_MEMORY"
    YAML = "YAML"
    POSTGRESQL = "POSTGRESQL"


@unique
class ConnectorHealthState(str, Enum):
    """Connector operational health status."""

    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"
