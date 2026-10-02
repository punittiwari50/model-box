"""FastAPI Application factory and dependency injection bootstrap adhering to STD-COD-002 and STD-COD-005."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

from model_connectors.application.dto.inference_dto import ConnectionCreateDTO
from model_connectors.application.use_cases.compact_conversation_use_case import (
    CompactConversationUseCase,
)
from model_connectors.application.use_cases.execute_inference_use_case import (
    ExecuteInferenceUseCase,
)
from model_connectors.application.use_cases.manage_connection_use_case import (
    ManageConnectionUseCase,
)
from model_connectors.application.use_cases.manage_session_use_case import (
    ManageSessionUseCase,
)
from model_connectors.application.use_cases.token_metrics_use_case import (
    TokenMetricsUseCase,
)
from model_connectors.application.workflow.langgraph_workflow import (
    ModelConnectorsWorkflow,
)
from model_connectors.domain.models.enums import (
    ConnectionProtocol,
    StorageBackend,
)
from model_connectors.infrastructure.config.environment import (
    IEnvironment,
    SpringEnvironment,
)
from model_connectors.infrastructure.config.settings import AppConfig
from model_connectors.infrastructure.connectors.connector_factory import (
    ModelConnectorFactory,
)
from model_connectors.infrastructure.persistence.storage_manager import StorageManager
from model_connectors.infrastructure.rate_limiting.token_bucket import (
    TokenBucketLimiter,
)
from model_connectors.presentation.api.routes import create_router


def create_app(
    config: AppConfig | None = None,
    environment: IEnvironment | None = None,
) -> FastAPI:
    """Builds and configures the FastAPI application with all ports and adapters wired."""
    env = environment or SpringEnvironment()
    app_config = config or AppConfig.from_environment(env)

    # 1. Instantiate Storage Manager (Strategy Pattern for In-Memory / PostgreSQL / YAML)
    storage_manager = StorageManager(app_config.storage)

    # 2. Instantiate Rate Limiter & Token Governor
    token_limiter = TokenBucketLimiter(
        default_capacity=app_config.rate_limits.default_token_capacity,
        default_refill_rate_per_sec=app_config.rate_limits.default_refill_rate_per_sec,
    )

    # 3. Instantiate Connectors Factory & Unified Connector
    connector_factory = ModelConnectorFactory()
    universal_connector = connector_factory.get_universal_connector()

    # 4. Instantiate LangGraph Workflow
    workflow = ModelConnectorsWorkflow(
        token_limiter=token_limiter,
        session_repo=storage_manager.session_repository,
        conversation_repo=storage_manager.conversation_repository,
        connector_factory=connector_factory,
        compaction_threshold=app_config.rate_limits.compaction_token_threshold,
    )

    # 5. Instantiate Application Use Cases
    session_use_case = ManageSessionUseCase(
        session_repo=storage_manager.session_repository,
        conversation_repo=storage_manager.conversation_repository,
    )
    connection_use_case = ManageConnectionUseCase(
        repositories=storage_manager.config_repositories,
        default_backend=app_config.storage.default_backend,
        connector_factory=connector_factory,
    )
    token_use_case = TokenMetricsUseCase(limiter=token_limiter)
    inference_use_case = ExecuteInferenceUseCase(
        workflow=workflow,
        connection_use_case=connection_use_case,
    )
    compaction_use_case = CompactConversationUseCase(
        conversation_repo=storage_manager.conversation_repository,
        token_threshold=app_config.rate_limits.compaction_token_threshold,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        # Pre-seed default connectors (Ollama, ComfyUI, gRPC, Kafka, Cookie)
        await connection_use_case.register_connection(
            ConnectionCreateDTO(
                connection_id="ollama-docker",
                name="Ollama Model Service",
                protocol=ConnectionProtocol.REST,
                endpoint_url=app_config.endpoints.ollama_url,
                model_name="llama3.2:latest",
                token_capacity=app_config.rate_limits.default_token_capacity,
                token_refill_rate_per_sec=app_config.rate_limits.default_refill_rate_per_sec,
                storage_backend=app_config.storage.default_backend,
            )
        )
        await connection_use_case.register_connection(
            ConnectionCreateDTO(
                connection_id="comfyui-docker",
                name="ComfyUI Image & Video Generator",
                protocol=ConnectionProtocol.WEBSOCKET,
                endpoint_url=app_config.endpoints.comfyui_url,
                model_name="flux1-lora",
                token_capacity=50_000,
                token_refill_rate_per_sec=500.0,
                storage_backend=app_config.storage.default_backend,
            )
        )
        await connection_use_case.register_connection(
            ConnectionCreateDTO(
                connection_id="grpc-service",
                name="gRPC High-Speed Serving",
                protocol=ConnectionProtocol.GRPC,
                endpoint_url=app_config.endpoints.grpc_service_url,
                model_name="tensorrt-llm",
                token_capacity=150_000,
                token_refill_rate_per_sec=2_000.0,
                storage_backend=app_config.storage.default_backend,
            )
        )
        await connection_use_case.register_connection(
            ConnectionCreateDTO(
                connection_id="kafka-service",
                name="Kafka Distributed Event Inference",
                protocol=ConnectionProtocol.KAFKA,
                endpoint_url=app_config.endpoints.kafka_bootstrap_servers,
                model_name="distributed-llm-v1",
                token_capacity=200_000,
                token_refill_rate_per_sec=2_500.0,
                storage_backend=app_config.storage.default_backend,
            )
        )
        await connection_use_case.register_connection(
            ConnectionCreateDTO(
                connection_id="cookie-web-api",
                name="Cookie-Authenticated Web AI",
                protocol=ConnectionProtocol.COOKIE_SESSION,
                endpoint_url="http://127.0.0.1:8000/api/v1/mock-cookie-ai",
                model_name="web-assistant",
                token_capacity=80_000,
                token_refill_rate_per_sec=800.0,
                storage_backend=app_config.storage.default_backend,
            )
        )
        yield

    app = FastAPI(
        title="ModelBox Connectors API",
        version="2.0.0",
        description="Enterprise multi-protocol model connectors with token budgeting, Spring Boot Environment, and LangGraph.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_config.server.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Attach API router
    api_router = create_router(
        session_uc=session_use_case,
        inference_uc=inference_use_case,
        token_uc=token_use_case,
        connection_uc=connection_use_case,
        compaction_uc=compaction_use_case,
        universal_connector=universal_connector,
        environment=env,
    )
    app.include_router(api_router)

    # Scaffold health endpoint adhering to STD-BLD-004
    @app.get("/health")
    async def health_check() -> dict[str, Any]:
        return {
            "status": "healthy",
            "service": "model-connectors",
            "active_profiles": list(env.get_active_profiles()),
            "storage_backend": app_config.storage.default_backend.value,
            "universal_connector_ready": True,
            "scaffold_readiness": "ready",
        }

    # Serve Interactive Dashboard UI
    static_file_path = Path(__file__).parent.parent / "static" / "index.html"

    @app.get("/", response_class=HTMLResponse)
    @app.get("/dashboard", response_class=HTMLResponse)
    async def dashboard() -> FileResponse:
        return FileResponse(static_file_path)

    return app


app = create_app()
