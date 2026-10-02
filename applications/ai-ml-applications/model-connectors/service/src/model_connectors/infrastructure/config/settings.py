"""Centralized Configuration Properties adhering to STD-COD-002 and Enterprise OOP standards.

Single source of truth for runtime settings, timeouts, endpoints, and credentials.
Initializes strictly via SpringEnvironment without any direct os.getenv calls.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping, Sequence

from model_connectors.domain.constants import (
    ConfigKeyConstants,
    EndpointConstants,
    KafkaConstants,
    MediaConstants,
    ProfileConstants,
    RateLimitConstants,
    SecurityConstants,
    ServerConstants,
    StorageConstants,
)
from model_connectors.domain.models.enums import StorageBackend
from model_connectors.infrastructure.config.environment import (
    IEnvironment,
    SpringEnvironment,
)


@dataclass(frozen=True)
class EndpointConfig:
    """Service discovery endpoints and network resolution settings."""

    ollama_url: str = EndpointConstants.DEFAULT_OLLAMA_LOCAL
    ollama_docker_url: str = EndpointConstants.DEFAULT_OLLAMA_DOCKER
    comfyui_url: str = EndpointConstants.DEFAULT_COMFYUI_LOCAL
    comfyui_docker_url: str = EndpointConstants.DEFAULT_COMFYUI_DOCKER
    grpc_service_url: str = EndpointConstants.DEFAULT_GRPC_LOCAL
    kafka_bootstrap_servers: str = EndpointConstants.DEFAULT_KAFKA_LOCAL
    resolution_strategy: str = "auto"


@dataclass(frozen=True)
class StorageConfig:
    """Configuration for persistence backends."""

    default_backend: StorageBackend = StorageBackend.IN_MEMORY
    sqlite_db_path: str = StorageConstants.DEFAULT_SQLITE_PATH
    yaml_config_dir: str = StorageConstants.DEFAULT_YAML_DIR
    postgres_dsn: str = StorageConstants.DEFAULT_POSTGRES_DSN
    postgres_min_pool_size: int = 2
    postgres_max_pool_size: int = 10
    postgres_timeout_seconds: float = 15.0


@dataclass(frozen=True)
class RateLimitConfig:
    """Global rate limiting and token bucket defaults."""

    default_token_capacity: int = RateLimitConstants.DEFAULT_TOKEN_CAPACITY
    default_refill_rate_per_sec: float = RateLimitConstants.DEFAULT_REFILL_RATE_PER_SEC
    compaction_token_threshold: int = RateLimitConstants.COMPACTION_TOKEN_THRESHOLD
    compaction_target_ratio: float = RateLimitConstants.COMPACTION_TARGET_RATIO


@dataclass(frozen=True)
class ServerConfig:
    """HTTP server and presentation parameters."""

    host: str = ServerConstants.DEFAULT_HOST
    port: int = ServerConstants.DEFAULT_PORT
    cors_origins: tuple[str, ...] = ServerConstants.DEFAULT_CORS_ORIGINS
    request_timeout_seconds: float = ServerConstants.DEFAULT_TIMEOUT_SECONDS
    worker_threads: int = 4


@dataclass(frozen=True)
class SecurityConfig:
    """Enterprise security policies, authentication modes, and secret references."""

    enabled: bool = True
    auth_method: str = SecurityConstants.AUTH_NONE
    api_key_header: str = SecurityConstants.HEADER_API_KEY
    bearer_token_prefix: str = SecurityConstants.BEARER_PREFIX
    session_cookie_name: str = SecurityConstants.DEFAULT_COOKIE_NAME
    hmac_secret: str = "model-box-default-secure-hmac-secret-change-in-prod"
    token_encryption_key: str = "model-box-32-byte-hex-encryption-key!!"
    allowed_roles: tuple[str, ...] = (
        SecurityConstants.ROLE_ADMIN,
        SecurityConstants.ROLE_ML_ENGINEER,
        SecurityConstants.ROLE_SERVICE_ACCOUNT,
    )
    audit_logging: bool = True


@dataclass(frozen=True)
class MediaConfig:
    """Configuration for image viewing and video chunk streaming."""

    max_image_size_mb: float = 25.0
    image_cache_ttl_seconds: int = 3600
    supported_image_mimes: tuple[str, ...] = (
        MediaConstants.MIME_PNG,
        MediaConstants.MIME_JPEG,
        MediaConstants.MIME_WEBP,
        MediaConstants.MIME_GIF,
    )
    video_chunk_size_bytes: int = MediaConstants.DEFAULT_VIDEO_CHUNK_SIZE_BYTES
    video_buffer_seconds: float = 5.0
    supported_video_codecs: tuple[str, ...] = (
        MediaConstants.MIME_MP4,
        MediaConstants.MIME_WEBM,
    )


@dataclass(frozen=True)
class KafkaConfig:
    """Configuration for distributed Kafka inference messaging."""

    client_id: str = KafkaConstants.DEFAULT_CLIENT_ID
    consumer_group: str = KafkaConstants.DEFAULT_CONSUMER_GROUP
    request_topic: str = KafkaConstants.TOPIC_INFERENCE_REQUESTS
    response_topic: str = KafkaConstants.TOPIC_INFERENCE_RESPONSES
    stream_topic: str = KafkaConstants.TOPIC_INFERENCE_STREAMS
    timeout_seconds: float = 45.0
    acks: str = KafkaConstants.ACKS_ALL


@dataclass(frozen=True)
class AppConfig:
    """Centralized root configuration properties record."""

    active_profiles: tuple[str, ...] = (ProfileConstants.DEV,)
    endpoints: EndpointConfig = field(default_factory=EndpointConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    rate_limits: RateLimitConfig = field(default_factory=RateLimitConfig)
    server: ServerConfig = field(default_factory=ServerConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)
    media: MediaConfig = field(default_factory=MediaConfig)
    kafka: KafkaConfig = field(default_factory=KafkaConfig)

    @classmethod
    def from_environment(cls, env: IEnvironment | None = None) -> "AppConfig":
        """Factory creating strongly-typed AppConfig by binding an IEnvironment instance."""
        environment = env or SpringEnvironment()
        active_profs = environment.get_active_profiles()

        # Parse Storage
        backend_raw = environment.get_property(
            ConfigKeyConstants.STORAGE_DEFAULT_BACKEND, StorageConstants.BACKEND_IN_MEMORY
        )
        try:
            backend = StorageBackend(str(backend_raw))
        except (ValueError, KeyError):
            backend = StorageBackend.IN_MEMORY

        storage = StorageConfig(
            default_backend=backend,
            sqlite_db_path=str(
                environment.get_property(
                    ConfigKeyConstants.STORAGE_SQLITE_PATH, StorageConstants.DEFAULT_SQLITE_PATH
                )
            ),
            yaml_config_dir=str(
                environment.get_property(
                    ConfigKeyConstants.STORAGE_YAML_DIR, StorageConstants.DEFAULT_YAML_DIR
                )
            ),
            postgres_dsn=str(
                environment.get_property(
                    ConfigKeyConstants.STORAGE_POSTGRES_DSN, StorageConstants.DEFAULT_POSTGRES_DSN
                )
            ),
            postgres_min_pool_size=int(
                environment.get_property(ConfigKeyConstants.STORAGE_POSTGRES_MIN_POOL, 2)
            ),
            postgres_max_pool_size=int(
                environment.get_property(ConfigKeyConstants.STORAGE_POSTGRES_MAX_POOL, 10)
            ),
        )

        # Parse Endpoints
        endpoints = EndpointConfig(
            ollama_url=str(
                environment.get_property(
                    ConfigKeyConstants.ENDPOINTS_OLLAMA_URL, EndpointConstants.DEFAULT_OLLAMA_LOCAL
                )
            ),
            ollama_docker_url=str(
                environment.get_property(
                    ConfigKeyConstants.ENDPOINTS_OLLAMA_DOCKER_URL,
                    EndpointConstants.DEFAULT_OLLAMA_DOCKER,
                )
            ),
            comfyui_url=str(
                environment.get_property(
                    ConfigKeyConstants.ENDPOINTS_COMFYUI_URL,
                    EndpointConstants.DEFAULT_COMFYUI_LOCAL,
                )
            ),
            comfyui_docker_url=str(
                environment.get_property(
                    ConfigKeyConstants.ENDPOINTS_COMFYUI_DOCKER_URL,
                    EndpointConstants.DEFAULT_COMFYUI_DOCKER,
                )
            ),
            grpc_service_url=str(
                environment.get_property(
                    ConfigKeyConstants.ENDPOINTS_GRPC_URL, EndpointConstants.DEFAULT_GRPC_LOCAL
                )
            ),
            kafka_bootstrap_servers=str(
                environment.get_property(
                    ConfigKeyConstants.ENDPOINTS_KAFKA_BOOTSTRAP,
                    EndpointConstants.DEFAULT_KAFKA_LOCAL,
                )
            ),
            resolution_strategy=str(
                environment.get_property(ConfigKeyConstants.ENDPOINTS_RESOLUTION_STRATEGY, "auto")
            ),
        )

        # Parse Rate Limits
        rate_limits = RateLimitConfig(
            default_token_capacity=int(
                environment.get_property(
                    ConfigKeyConstants.RATE_LIMIT_CAPACITY, RateLimitConstants.DEFAULT_TOKEN_CAPACITY
                )
            ),
            default_refill_rate_per_sec=float(
                environment.get_property(
                    ConfigKeyConstants.RATE_LIMIT_REFILL_RATE,
                    RateLimitConstants.DEFAULT_REFILL_RATE_PER_SEC,
                )
            ),
            compaction_token_threshold=int(
                environment.get_property(
                    ConfigKeyConstants.RATE_LIMIT_COMPACTION_THRESHOLD,
                    RateLimitConstants.COMPACTION_TOKEN_THRESHOLD,
                )
            ),
            compaction_target_ratio=float(
                environment.get_property("rate_limits.compaction_target_ratio", 0.35)
            ),
        )

        # Parse Server
        cors_raw = environment.get_property(
            ConfigKeyConstants.SERVER_CORS_ORIGINS, ServerConstants.DEFAULT_CORS_ORIGINS
        )
        if isinstance(cors_raw, str):
            cors_tuple = tuple(c.strip() for c in cors_raw.split(","))
        elif isinstance(cors_raw, (list, tuple)):
            cors_tuple = tuple(cors_raw)
        else:
            cors_tuple = ("*",)

        server = ServerConfig(
            host=str(
                environment.get_property(
                    ConfigKeyConstants.SERVER_HOST, ServerConstants.DEFAULT_HOST
                )
            ),
            port=int(
                environment.get_property(
                    ConfigKeyConstants.SERVER_PORT, ServerConstants.DEFAULT_PORT
                )
            ),
            cors_origins=cors_tuple,
            request_timeout_seconds=float(
                environment.get_property(
                    ConfigKeyConstants.SERVER_TIMEOUT, ServerConstants.DEFAULT_TIMEOUT_SECONDS
                )
            ),
        )

        # Parse Security
        security = SecurityConfig(
            enabled=bool(
                environment.get_property(
                    ConfigKeyConstants.SECURITY_ENABLED, True, target_type=bool
                )
            ),
            auth_method=str(
                environment.get_property(
                    ConfigKeyConstants.SECURITY_AUTH_METHOD, SecurityConstants.AUTH_NONE
                )
            ),
            api_key_header=str(
                environment.get_property(
                    ConfigKeyConstants.SECURITY_API_KEY_HEADER, SecurityConstants.HEADER_API_KEY
                )
            ),
            bearer_token_prefix=str(
                environment.get_property(
                    ConfigKeyConstants.SECURITY_BEARER_PREFIX, SecurityConstants.BEARER_PREFIX
                )
            ),
            hmac_secret=str(
                environment.get_property(
                    ConfigKeyConstants.SECURITY_HMAC_SECRET,
                    "model-box-default-secure-hmac-secret-change-in-prod",
                )
            ),
            audit_logging=bool(
                environment.get_property(
                    ConfigKeyConstants.SECURITY_AUDIT_LOGGING, True, target_type=bool
                )
            ),
        )

        # Parse Media
        media = MediaConfig(
            max_image_size_mb=float(
                environment.get_property("media.image_viewer.max_size_mb", 25.0)
            ),
            image_cache_ttl_seconds=int(
                environment.get_property("media.image_viewer.cache_ttl_seconds", 3600)
            ),
            video_chunk_size_bytes=int(
                environment.get_property(
                    "media.video_streaming.chunk_size_bytes",
                    MediaConstants.DEFAULT_VIDEO_CHUNK_SIZE_BYTES,
                )
            ),
        )

        # Parse Kafka
        kafka = KafkaConfig(
            client_id=str(
                environment.get_property("connectors.kafka.client_id", KafkaConstants.DEFAULT_CLIENT_ID)
            ),
            consumer_group=str(
                environment.get_property(
                    "connectors.kafka.consumer_group", KafkaConstants.DEFAULT_CONSUMER_GROUP
                )
            ),
            request_topic=str(
                environment.get_property(
                    "connectors.kafka.request_topic", KafkaConstants.TOPIC_INFERENCE_REQUESTS
                )
            ),
            response_topic=str(
                environment.get_property(
                    "connectors.kafka.response_topic", KafkaConstants.TOPIC_INFERENCE_RESPONSES
                )
            ),
            stream_topic=str(
                environment.get_property(
                    "connectors.kafka.stream_topic", KafkaConstants.TOPIC_INFERENCE_STREAMS
                )
            ),
            timeout_seconds=float(
                environment.get_property("connectors.kafka.timeout_seconds", 45.0)
            ),
        )

        return cls(
            active_profiles=active_profs,
            endpoints=endpoints,
            storage=storage,
            rate_limits=rate_limits,
            server=server,
            security=security,
            media=media,
            kafka=kafka,
        )

    @classmethod
    def load_from_yaml(cls, yaml_path: Path | None = None) -> "AppConfig":
        """Legacy-compatible YAML loader routing through SpringEnvironment."""
        config_dir = yaml_path.parent if yaml_path else None
        env = SpringEnvironment(config_dir=config_dir)
        return cls.from_environment(env)
