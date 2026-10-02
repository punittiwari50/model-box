"""Centralized Final Static Constants adhering to STD-COD-002 and Enterprise OOP standards.

Mimics Java `public static final` and TypeScript `const` semantics using `typing.Final`.
All immutable configuration keys, default values, error codes, protocols, and profiles are defined here.
"""

from typing import Final


class ProfileConstants:
    """Final static definitions for environment profile identifiers."""

    DEFAULT: Final[str] = "default"
    DEV: Final[str] = "dev"
    DOCKER: Final[str] = "docker"
    PROD: Final[str] = "prod"
    TEST: Final[str] = "test"


class ServerConstants:
    """Final static definitions for HTTP and server infrastructure."""

    DEFAULT_HOST: Final[str] = "0.0.0.0"
    DEFAULT_PORT: Final[int] = 8000
    DEFAULT_TIMEOUT_SECONDS: Final[float] = 60.0
    DEFAULT_CORS_ORIGINS: Final[tuple[str, ...]] = ("*",)


class StorageConstants:
    """Final static definitions for persistence backends."""

    BACKEND_IN_MEMORY: Final[str] = "IN_MEMORY"
    BACKEND_POSTGRES: Final[str] = "POSTGRESQL"
    BACKEND_YAML: Final[str] = "YAML"
    DEFAULT_SQLITE_PATH: Final[str] = ":memory:"
    DEFAULT_YAML_DIR: Final[str] = "./config/connections"
    DEFAULT_POSTGRES_DSN: Final[str] = (
        "postgresql://postgres:postgres@localhost:5432/model_connectors"
    )


class ProtocolConstants:
    """Final static definitions for multi-protocol connector communication."""

    REST: Final[str] = "REST"
    GRPC: Final[str] = "GRPC"
    WEBSOCKET: Final[str] = "WEBSOCKET"
    KAFKA: Final[str] = "KAFKA"
    COOKIE_SESSION: Final[str] = "COOKIE_SESSION"


class EndpointConstants:
    """Final static defaults for service endpoints and Docker network discovery."""

    DEFAULT_OLLAMA_LOCAL: Final[str] = "http://127.0.0.1:11435"
    DEFAULT_OLLAMA_DOCKER: Final[str] = "http://ollama-model-service-gpu:11434"
    DEFAULT_COMFYUI_LOCAL: Final[str] = "http://127.0.0.1:8189"
    DEFAULT_COMFYUI_DOCKER: Final[str] = "http://comfyui-model-service-gpu:8188"
    DEFAULT_GRPC_LOCAL: Final[str] = "grpc://127.0.0.1:50051"
    DEFAULT_KAFKA_LOCAL: Final[str] = "127.0.0.1:9092"
    DOCKER_HOST_FALLBACK: Final[str] = "host.docker.internal"


class SecurityConstants:
    """Final static definitions for enterprise authentication, roles, and headers."""

    AUTH_NONE: Final[str] = "NONE"
    AUTH_API_KEY: Final[str] = "API_KEY"
    AUTH_BEARER: Final[str] = "BEARER"
    AUTH_HMAC: Final[str] = "HMAC"
    AUTH_MTLS: Final[str] = "MTLS"
    AUTH_COOKIE_SESSION: Final[str] = "COOKIE_SESSION"

    HEADER_API_KEY: Final[str] = "X-API-Key"
    HEADER_AUTHORIZATION: Final[str] = "Authorization"
    HEADER_SESSION_ID: Final[str] = "X-Session-ID"
    HEADER_REQUEST_ID: Final[str] = "X-Request-ID"
    HEADER_CORRELATION_ID: Final[str] = "X-Correlation-ID"
    HEADER_SIGNATURE: Final[str] = "X-Signature-SHA256"

    BEARER_PREFIX: Final[str] = "Bearer "
    DEFAULT_COOKIE_NAME: Final[str] = "session_cookie"

    ROLE_ADMIN: Final[str] = "admin"
    ROLE_ML_ENGINEER: Final[str] = "ml-engineer"
    ROLE_SERVICE_ACCOUNT: Final[str] = "service-account"


class MediaConstants:
    """Final static definitions for media handling, MIME types, and streaming buffers."""

    MIME_PNG: Final[str] = "image/png"
    MIME_JPEG: Final[str] = "image/jpeg"
    MIME_WEBP: Final[str] = "image/webp"
    MIME_GIF: Final[str] = "image/gif"
    MIME_MP4: Final[str] = "video/mp4"
    MIME_WEBM: Final[str] = "video/webm"
    MIME_OCTET_STREAM: Final[str] = "application/octet-stream"

    DEFAULT_VIDEO_CHUNK_SIZE_BYTES: Final[int] = 512 * 1024  # 512 KB
    MAX_IMAGE_SIZE_BYTES: Final[int] = 25 * 1024 * 1024     # 25 MB


class KafkaConstants:
    """Final static definitions for Kafka topics, groups, and message semantics."""

    DEFAULT_BOOTSTRAP_SERVERS: Final[str] = "127.0.0.1:9092"
    DEFAULT_CLIENT_ID: Final[str] = "model-connectors-client"
    DEFAULT_CONSUMER_GROUP: Final[str] = "model-connectors-inference-group"
    TOPIC_INFERENCE_REQUESTS: Final[str] = "model.inference.requests"
    TOPIC_INFERENCE_RESPONSES: Final[str] = "model.inference.responses"
    TOPIC_INFERENCE_STREAMS: Final[str] = "model.inference.streams"
    ACKS_ALL: Final[str] = "all"


class RateLimitConstants:
    """Final static definitions for token bucket and conversation compaction."""

    DEFAULT_TOKEN_CAPACITY: Final[int] = 100_000
    DEFAULT_REFILL_RATE_PER_SEC: Final[float] = 1_000.0
    COMPACTION_TOKEN_THRESHOLD: Final[int] = 4_000
    COMPACTION_TARGET_RATIO: Final[float] = 0.35


class ConfigKeyConstants:
    """Final static dot-notation keys for externalized configuration."""

    SPRING_PROFILES_ACTIVE: Final[str] = "spring.profiles.active"
    SPRING_APPLICATION_NAME: Final[str] = "spring.application.name"

    SERVER_HOST: Final[str] = "server.host"
    SERVER_PORT: Final[str] = "server.port"
    SERVER_CORS_ORIGINS: Final[str] = "server.cors_origins"
    SERVER_TIMEOUT: Final[str] = "server.request_timeout_seconds"

    STORAGE_DEFAULT_BACKEND: Final[str] = "storage.default_backend"
    STORAGE_SQLITE_PATH: Final[str] = "storage.sqlite.db_path"
    STORAGE_YAML_DIR: Final[str] = "storage.yaml.config_dir"
    STORAGE_POSTGRES_DSN: Final[str] = "storage.postgres.dsn"
    STORAGE_POSTGRES_MIN_POOL: Final[str] = "storage.postgres.min_pool_size"
    STORAGE_POSTGRES_MAX_POOL: Final[str] = "storage.postgres.max_pool_size"

    ENDPOINTS_OLLAMA_URL: Final[str] = "endpoints.ollama_url"
    ENDPOINTS_OLLAMA_DOCKER_URL: Final[str] = "endpoints.ollama_docker_url"
    ENDPOINTS_COMFYUI_URL: Final[str] = "endpoints.comfyui_url"
    ENDPOINTS_COMFYUI_DOCKER_URL: Final[str] = "endpoints.comfyui_docker_url"
    ENDPOINTS_GRPC_URL: Final[str] = "endpoints.grpc_service_url"
    ENDPOINTS_KAFKA_BOOTSTRAP: Final[str] = "endpoints.kafka_bootstrap_servers"
    ENDPOINTS_RESOLUTION_STRATEGY: Final[str] = "endpoints.resolution_strategy"

    SECURITY_ENABLED: Final[str] = "security.enabled"
    SECURITY_AUTH_METHOD: Final[str] = "security.auth_method"
    SECURITY_API_KEY_HEADER: Final[str] = "security.api_key_header"
    SECURITY_BEARER_PREFIX: Final[str] = "security.bearer_token_prefix"
    SECURITY_HMAC_SECRET: Final[str] = "security.hmac_secret"
    SECURITY_AUDIT_LOGGING: Final[str] = "security.audit_logging"

    RATE_LIMIT_CAPACITY: Final[str] = "rate_limits.default_token_capacity"
    RATE_LIMIT_REFILL_RATE: Final[str] = "rate_limits.default_refill_rate_per_sec"
    RATE_LIMIT_COMPACTION_THRESHOLD: Final[str] = "rate_limits.compaction_token_threshold"


class ErrorConstants:
    """Final static error codes for domain and distributed system exceptions."""

    ERR_CONFIGURATION: Final[str] = "ERR_CONFIG_001"
    ERR_CONNECTION_FAILED: Final[str] = "ERR_CONN_001"
    ERR_CIRCUIT_OPEN: Final[str] = "ERR_RESILIENCE_001"
    ERR_UNAUTHORIZED: Final[str] = "ERR_SEC_001"
    ERR_FORBIDDEN: Final[str] = "ERR_SEC_002"
    ERR_RATE_LIMIT_EXCEEDED: Final[str] = "ERR_RATE_001"
    ERR_UNSUPPORTED_PROTOCOL: Final[str] = "ERR_PROTO_001"
    ERR_MEDIA_PROCESSING: Final[str] = "ERR_MEDIA_001"
    ERR_STORAGE_FAILURE: Final[str] = "ERR_STORE_001"
