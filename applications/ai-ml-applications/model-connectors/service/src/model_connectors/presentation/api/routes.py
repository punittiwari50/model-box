"""FastAPI Presentation Layer and Dependency Injection adhering to STD-COD-005.

Defines REST endpoints for sessions, model connectors, token metrics, media, and Spring environment.
"""

from dataclasses import asdict
from typing import Any, Mapping
from fastapi import APIRouter, HTTPException, Header, Query, Response
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from model_connectors.application.dto.inference_dto import (
    ConnectionCreateDTO,
    InferenceInputDTO,
    SessionCreateDTO,
)
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
from model_connectors.domain.models.enums import (
    AuthMethod,
    ConnectionProtocol,
    StorageBackend,
)
from model_connectors.domain.models.media import MediaRequest
from model_connectors.domain.ports.connector import IUniversalModelConnector
from model_connectors.infrastructure.config.environment import IEnvironment


class SessionRequest(BaseModel):
    user_id: str = Field(..., examples=["engineer-01"])
    cookie_id: str = Field(..., examples=["cookie-session-token-abc"])
    metadata: dict[str, str] = Field(default_factory=dict)


class InferenceRequestModel(BaseModel):
    session_id: str
    prompt: str
    connection_id: str = "ollama-docker"
    user_id: str = "engineer-01"
    cookie_id: str = "cookie-abc"
    model_name: str = ""
    parameters: dict[str, Any] = Field(default_factory=dict)


class ConnectionCreateModel(BaseModel):
    connection_id: str
    name: str
    protocol: ConnectionProtocol
    endpoint_url: str
    model_name: str
    auth_method: AuthMethod = AuthMethod.NONE
    auth_payload: dict[str, str] = Field(default_factory=dict)
    timeout_seconds: float = 60.0
    max_retries: int = 3
    rate_limit_rpm: int = 60
    token_capacity: int = 100_000
    token_refill_rate_per_sec: float = 1_000.0
    storage_backend: StorageBackend = StorageBackend.IN_MEMORY


SENSITIVE_KEY_SUBSTRINGS = ("secret", "password", "key", "token", "credential", "auth")


def _is_sensitive_key(key: str) -> bool:
    """Checks if a configuration property key contains sensitive indicators."""
    normalized = key.lower()
    return any(pattern in normalized for pattern in SENSITIVE_KEY_SUBSTRINGS)


def _mask_sensitive_properties(props: Mapping[str, Any]) -> dict[str, Any]:
    """Masks secrets and sensitive credentials in property dictionaries."""
    return {
        k: ("***REDACTED***" if _is_sensitive_key(k) else v)
        for k, v in props.items()
    }


def create_router(
    session_uc: ManageSessionUseCase,
    inference_uc: ExecuteInferenceUseCase,
    token_uc: TokenMetricsUseCase,
    connection_uc: ManageConnectionUseCase,
    compaction_uc: CompactConversationUseCase,
    universal_connector: IUniversalModelConnector | None = None,
    environment: IEnvironment | None = None,
) -> APIRouter:
    """Builds and returns the configured FastAPI APIRouter."""
    router = APIRouter(prefix="/api/v1")

    @router.post("/sessions")
    async def create_session(req: SessionRequest) -> JSONResponse:
        dto = SessionCreateDTO(user_id=req.user_id, cookie_id=req.cookie_id, metadata=req.metadata)
        res = await session_uc.create_session(dto)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(status_code=201, content=asdict(res.unwrap()))

    @router.get("/sessions")
    async def list_sessions(user_id: str | None = Query(None)) -> JSONResponse:
        res = await session_uc.list_sessions(user_id)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content=[asdict(s) for s in res.unwrap()])

    @router.get("/sessions/{session_id}/messages")
    async def get_messages(session_id: str, limit: int = 50) -> JSONResponse:
        res = await session_uc.get_history(session_id, limit)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content=[asdict(m) for m in res.unwrap()])

    @router.get("/sessions/{session_id}/compaction")
    async def get_compaction(session_id: str) -> JSONResponse:
        res = await session_uc.get_latest_compaction(session_id)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        comp = res.unwrap()
        return JSONResponse(content=asdict(comp) if comp else None)

    @router.post("/sessions/{session_id}/compact")
    async def trigger_compaction(session_id: str) -> JSONResponse:
        res = await compaction_uc.execute(session_id, force=True)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        comp = res.unwrap()
        return JSONResponse(content={"status": "compacted", "compaction_id": comp.compaction_id if comp else None})

    @router.post("/inference")
    async def execute_inference(req: InferenceRequestModel) -> JSONResponse:
        dto = InferenceInputDTO(
            session_id=req.session_id,
            prompt=req.prompt,
            connection_id=req.connection_id,
            user_id=req.user_id,
            cookie_id=req.cookie_id,
            model_name=req.model_name,
            parameters=req.parameters,
        )
        res = await inference_uc.execute(dto)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content=asdict(res.unwrap()))

    @router.get("/tokens/{connection_id}")
    async def get_token_metrics(connection_id: str) -> JSONResponse:
        res = token_uc.get_token_status(connection_id)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content=asdict(res.unwrap()))

    @router.get("/connections")
    async def list_connections(backend: StorageBackend | None = Query(None)) -> JSONResponse:
        res = await connection_uc.list_connections(backend)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content=[asdict(c) for c in res.unwrap()])

    @router.post("/connections")
    async def register_connection(req: ConnectionCreateModel) -> JSONResponse:
        dto = ConnectionCreateDTO(
            connection_id=req.connection_id,
            name=req.name,
            protocol=req.protocol,
            endpoint_url=req.endpoint_url,
            model_name=req.model_name,
            auth_method=req.auth_method,
            auth_payload=req.auth_payload,
            timeout_seconds=req.timeout_seconds,
            max_retries=req.max_retries,
            rate_limit_rpm=req.rate_limit_rpm,
            token_capacity=req.token_capacity,
            token_refill_rate_per_sec=req.token_refill_rate_per_sec,
            storage_backend=req.storage_backend,
        )
        res = await connection_uc.register_connection(dto)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(status_code=201, content=asdict(res.unwrap()))

    @router.get("/connections/{connection_id}/health")
    async def check_health(connection_id: str) -> JSONResponse:
        res = await connection_uc.check_connection_health(connection_id)
        if res.is_failure:
            return JSONResponse(
                status_code=503,
                content={"status": "UNAVAILABLE", "error": str(res.error)},
            )
        return JSONResponse(content=asdict(res.unwrap()))

    @router.get("/connections/{connection_id}/models")
    async def get_connection_models(connection_id: str) -> JSONResponse:
        res = await connection_uc.list_available_models(connection_id)
        if res.is_failure:
            return JSONResponse(
                status_code=500,
                content={"error": str(res.error)},
            )
        return JSONResponse(content=res.unwrap())

    # --- Spring Boot Environment & Multimedia Endpoints ---

    @router.get("/environment")
    async def get_environment_info() -> JSONResponse:
        """Returns Spring Boot Environment profiles and property source inspection metadata."""
        if not environment:
            return JSONResponse(content={"active_profiles": ["dev"], "sources": []})

        sources_info = [
            {
                "name": src.name,
                "properties_count": len(clean_props),
                "sample": clean_props,
            }
            for src in environment.get_property_sources()
            if (clean_props := _mask_sensitive_properties(src.get_all_properties())) is not None
        ]

        return JSONResponse(
            content={
                "active_profiles": list(environment.get_active_profiles()),
                "default_profiles": list(environment.get_default_profiles()),
                "property_sources": sources_info,
            }
        )

    @router.get("/media/image")
    async def view_image(
        connection_id: str = Query("comfyui-docker"),
        filename: str = Query("ModelConnectors_00001_.png"),
        subfolder: str = Query(""),
    ) -> Response:
        """Serves static or diffusion-generated images through the universal connector."""
        if not universal_connector:
            raise HTTPException(status_code=501, detail="Universal connector not wired")

        conn_res = await connection_uc.get_connection(connection_id)
        if conn_res.is_failure:
            raise HTTPException(status_code=404, detail=f"Connection '{connection_id}' not found")

        req = MediaRequest(
            media_id=filename,
            media_type="image",
            parameters={"filename": filename, "subfolder": subfolder},
        )
        media_res = await universal_connector.view_image(req, conn_res.unwrap())
        if media_res.is_failure:
            raise HTTPException(status_code=500, detail=str(media_res.error))

        asset = media_res.unwrap()
        return Response(content=asset.data, media_type=asset.mime_type)

    @router.get("/media/video")
    async def stream_video(
        connection_id: str = Query("comfyui-docker"),
        video_id: str = Query("generated_stream.mp4"),
        range_header: str | None = Header(None, alias="Range"),
    ) -> StreamingResponse:
        """Streams chunked video frames through the universal connector with seekable range support."""
        if not universal_connector:
            raise HTTPException(status_code=501, detail="Universal connector not wired")

        conn_res = await connection_uc.get_connection(connection_id)
        if conn_res.is_failure:
            raise HTTPException(status_code=404, detail=f"Connection '{connection_id}' not found")

        req = MediaRequest(
            media_id=video_id,
            media_type="video",
            range_header=range_header,
        )
        stream_gen = universal_connector.stream_video(req, conn_res.unwrap())
        return StreamingResponse(stream_gen, media_type="video/mp4")

    return router
