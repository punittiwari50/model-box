"""FastAPI Presentation Layer and Dependency Injection adhering to STD-COD-005.

Defines REST endpoints for projects, sessions, model connectors, token metrics, media, and Spring environment.
"""

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Mapping
import uuid
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
from model_connectors.domain.models.conversation import ConversationMessage
from model_connectors.domain.models.enums import (
    AuthMethod,
    ConnectionProtocol,
    MessageRole,
    StorageBackend,
)
from enum import Enum
from model_connectors.domain.models.media import MediaRequest
from model_connectors.domain.models.project import Project
from model_connectors.domain.models.mcp_testing import (
    TestStep,
    TestStepAction,
    TestWorkflow,
    TestWorkflowResult,
)
from model_connectors.domain.ports.connector import IUniversalModelConnector
from model_connectors.infrastructure.config.environment import IEnvironment
from model_connectors.infrastructure.connectors.playwright_mcp_connector import (
    PlaywrightMcpConnector,
)


def _serialize_entity(obj: Any) -> Any:
    """Recursively serializes dataclass, dict, enum, and datetime objects into JSON-compatible values."""
    if hasattr(obj, "__dataclass_fields__"):
        return {k: _serialize_entity(v) for k, v in asdict(obj).items()}
    elif isinstance(obj, dict):
        return {k: _serialize_entity(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [_serialize_entity(v) for v in obj]
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, Enum):
        return obj.value
    return obj


class ProjectModel(BaseModel):
    project_id: str
    name: str
    description: str
    tags: list[str] = Field(default_factory=list)
    assigned_users: list[str] = Field(default_factory=list)
    system_prompt: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


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
    project_id: str = "linkedin-job-hunter"
    user_tag: str = "general"
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
    project_repo: Any = None,
    conversation_repo: Any = None,
    playwright_connector: PlaywrightMcpConnector | None = None,
) -> APIRouter:
    """Builds and returns the configured FastAPI APIRouter."""
    router = APIRouter(prefix="/api/v1")
    playwright_client = playwright_connector or PlaywrightMcpConnector()

    # --------------------------------------------------------------------------
    # Projects Endpoints (LinkedIn Job Hunter, Animation Films, etc.)
    # --------------------------------------------------------------------------
    @router.get("/projects")
    async def list_projects() -> JSONResponse:
        """Returns all registered projects with tags and assigned users."""
        if not project_repo:
            return JSONResponse(content=[])
        res = await project_repo.list_projects()
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content=[_serialize_entity(p) for p in res.unwrap()])

    @router.post("/projects")
    async def save_project(req: ProjectModel) -> JSONResponse:
        """Creates or updates a project."""
        if not project_repo:
            raise HTTPException(status_code=500, detail="Project repository unavailable")
        proj = Project(
            project_id=req.project_id,
            name=req.name,
            description=req.description,
            tags=tuple(req.tags),
            assigned_users=tuple(req.assigned_users),
            system_prompt=req.system_prompt,
            metadata=req.metadata,
        )
        res = await project_repo.save_project(proj)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(status_code=201, content={"status": "saved", "project_id": req.project_id})

    @router.get("/projects/{project_id}")
    async def get_project(project_id: str) -> JSONResponse:
        """Retrieves project details by project_id."""
        if not project_repo:
            raise HTTPException(status_code=500, detail="Project repository unavailable")
        res = await project_repo.get_project(project_id)
        if res.is_failure or not res.unwrap():
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        return JSONResponse(content=_serialize_entity(res.unwrap()))

    @router.get("/projects/{project_id}/messages")
    async def get_project_messages(project_id: str, limit: int = 100) -> JSONResponse:
        """Retrieves all conversation messages saved in the database for this project."""
        if not conversation_repo:
            return JSONResponse(content=[])
        res = await conversation_repo.get_project_messages(project_id, limit)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content=[_serialize_entity(m) for m in res.unwrap()])

    # --------------------------------------------------------------------------
    # Sessions & Messages Endpoints
    # --------------------------------------------------------------------------
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

    # --------------------------------------------------------------------------
    # Inference Execution with Automatic Conversation Persistence
    # --------------------------------------------------------------------------
    @router.post("/inference")
    async def execute_inference(req: InferenceRequestModel) -> JSONResponse:
        """Executes inference and guarantees user & assistant messages are saved to database."""
        # 1. Persist user prompt message to database
        user_msg = ConversationMessage(
            message_id=f"msg-user-{uuid.uuid4().hex[:8]}",
            session_id=req.session_id,
            role=MessageRole.USER,
            content=req.prompt,
            token_count=max(1, len(req.prompt.split())),
            timestamp=datetime.now(timezone.utc),
            model_name=req.model_name or "user",
            project_id=req.project_id,
            user_tag=req.user_tag,
        )
        if conversation_repo:
            await conversation_repo.save_message(user_msg)

        # 2. Execute inference
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

        resp_val = res.unwrap()
        ts = getattr(resp_val, "token_status", None)
        token_count = ts.tokens_consumed_total if ts else 0
        token_metrics_dict = {
            "tokens_consumed_total": getattr(ts, "tokens_consumed_total", 0),
            "tokens_consumed_request": getattr(ts, "tokens_consumed_request", 0),
            "tokens_available": getattr(ts, "tokens_available", 100000),
            "bucket_capacity": getattr(ts, "bucket_capacity", 100000),
            "refill_rate_per_second": getattr(ts, "refill_rate_per_sec", 1000.0),
        }

        # 3. Persist model response message to database
        assistant_msg = ConversationMessage(
            message_id=resp_val.response_id,
            session_id=req.session_id,
            role=MessageRole.ASSISTANT,
            content=resp_val.content,
            token_count=token_count,
            timestamp=datetime.now(timezone.utc),
            model_name=req.model_name or "assistant",
            project_id=req.project_id,
            user_tag=req.user_tag,
        )
        if conversation_repo:
            await conversation_repo.save_message(assistant_msg)

        content_dict = {
            "response_id": resp_val.response_id,
            "session_id": resp_val.session_id,
            "content": resp_val.content,
            "model_name": resp_val.model_name,
            "protocol": resp_val.protocol,
            "execution_duration_ms": resp_val.execution_duration_ms,
            "token_metrics": token_metrics_dict,
            "timestamp": resp_val.timestamp,
        }
        return JSONResponse(content=content_dict)

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
        return JSONResponse(status_code=201, content={"status": "registered", "connection_id": req.connection_id})

    @router.delete("/connections/{connection_id}")
    async def remove_connection(connection_id: str, backend: StorageBackend = StorageBackend.IN_MEMORY) -> JSONResponse:
        res = await connection_uc.remove_connection(connection_id, backend)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content={"status": "deleted", "connection_id": connection_id})

    # --------------------------------------------------------------------------
    # Multimedia Streaming Endpoints (STD-PAT-CORE-SHELL)
    # --------------------------------------------------------------------------
    @router.get("/media/images/{filename}")
    async def get_image(filename: str) -> Response:
        """Retrieves an image artifact."""
        if universal_connector is None:
            raise HTTPException(status_code=503, detail="Universal connector not available")
        req = MediaRequest(
            resource_id=filename,
            resource_type="image",
            mime_type="image/png",
            session_id="global",
        )
        res = await universal_connector.media_handler.process_image(req)
        if res.is_failure:
            raise HTTPException(status_code=404, detail=str(res.error))
        artifact = res.unwrap()
        return Response(content=artifact.payload, media_type=artifact.mime_type)

    @router.get("/media/videos/{filename}")
    async def stream_video(
        filename: str,
        range: str | None = Header(None),
    ) -> StreamingResponse:
        """Streams a video file with chunked byte-range support."""
        if universal_connector is None:
            raise HTTPException(status_code=503, detail="Universal connector not available")
        req = MediaRequest(
            resource_id=filename,
            resource_type="video",
            mime_type="video/mp4",
            session_id="global",
        )
        res = await universal_connector.media_handler.stream_video(req, range_header=range)
        if res.is_failure:
            raise HTTPException(status_code=404, detail=str(res.error))
        artifact = res.unwrap()

        status_code = 206 if range else 200
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes 0-{artifact.size_bytes - 1}/{artifact.size_bytes}",
            "Content-Length": str(artifact.size_bytes),
        }
        return StreamingResponse(
            iter([artifact.payload]),
            status_code=status_code,
            headers=headers,
            media_type=artifact.mime_type,
        )

    # --------------------------------------------------------------------------
    # Environment Inspection Endpoint (Spring Boot Environment Pattern)
    # --------------------------------------------------------------------------
    @router.get("/env")
    async def get_environment() -> JSONResponse:
        """Returns Spring Boot Environment metadata, active profiles, and sanitized properties."""
        if environment is None:
            return JSONResponse(content={"status": "Environment abstraction not initialized"})

        property_sources_summary: list[dict[str, Any]] = []
        for src in environment.get_property_sources():
            raw_props = src.get_all_properties()
            property_sources_summary.append({
                "name": src.name,
                "property_count": len(raw_props),
                "properties": _mask_sensitive_properties(raw_props),
            })

        return JSONResponse(content={
            "active_profiles": list(environment.get_active_profiles()),
            "default_profiles": list(environment.get_default_profiles()),
            "property_sources": property_sources_summary,
            "order_of_precedence": [
                "1. Command Line Arguments (--key=value)",
                "2. Active Profile YAMLs (application-{profile}.yml)",
                "3. Base Application YAML (application.yml)",
                "4. System Environment Variables (SystemEnvironmentPropertySource)",
            ],
        })

    # --------------------------------------------------------------------------
    # Model Context Protocol (MCP) Playwright Testing & Workflow Endpoints
    # --------------------------------------------------------------------------
    @router.get("/mcp/playwright/schema")
    async def get_playwright_test_schema() -> JSONResponse:
        """Returns the full JSON Schema definitions for TestWorkflow and TestWorkflowResult."""
        return JSONResponse(
            content={
                "title": "ModelBox MCP Playwright JSON Testing Schema",
                "version": "1.0.0",
                "description": "Standard schema for defining, executing, and reporting automated browser tests via Playwright MCP",
                "test_workflow_schema": TestWorkflow.model_json_schema(),
                "test_workflow_result_schema": TestWorkflowResult.model_json_schema(),
            }
        )

    @router.get("/mcp/playwright/templates")
    async def get_playwright_test_templates() -> JSONResponse:
        """Returns pre-configured JSON testing workflow templates."""
        templates = [
            {
                "workflow_id": "wf-modelbox-ui-smoke",
                "name": "ModelBox UI Smoke & Title Verification Test",
                "description": "Verifies that the React UI loads successfully and displays the expected title and branding",
                "base_url": "http://model-connectors-ui:3000",
                "timeout_ms": 30000,
                "steps": [
                    {
                        "step_id": "step-1",
                        "action": "navigate",
                        "description": "Navigate to ModelBox Web UI root",
                        "params": {"url": "http://model-connectors-ui:3000"},
                    },
                    {
                        "step_id": "step-2",
                        "action": "assert_title",
                        "description": "Assert page title contains ModelBox",
                        "params": {"expected_title": "ModelBox"},
                    },
                    {
                        "step_id": "step-3",
                        "action": "assert_text",
                        "description": "Verify presence of ModelBox branding in DOM",
                        "params": {"expected_text": "ModelBox | Connectors"},
                    },
                    {
                        "step_id": "step-4",
                        "action": "snapshot",
                        "description": "Capture full DOM accessibility snapshot",
                        "params": {},
                    },
                ],
                "metadata": {"category": "smoke", "author": "QA Automation"},
            },
            {
                "workflow_id": "wf-modelbox-console-interactivity",
                "name": "ModelBox Console Prompt Input Interaction Test",
                "description": "Verifies that prompt input accepts text and UI interactions work via Playwright MCP",
                "base_url": "http://model-connectors-ui:3000",
                "timeout_ms": 45000,
                "steps": [
                    {
                        "step_id": "step-1",
                        "action": "navigate",
                        "description": "Navigate to Universal Console UI",
                        "params": {"url": "http://model-connectors-ui:3000"},
                    },
                    {
                        "step_id": "step-2",
                        "action": "assert_visible",
                        "description": "Verify root container is rendered and visible",
                        "params": {"selector": "#root"},
                    },
                    {
                        "step_id": "step-3",
                        "action": "evaluate",
                        "description": "Inspect window and document state via Playwright JS evaluation",
                        "params": {"script": "() => ({ readyState: document.readyState, origin: window.location.origin })"},
                    },
                    {
                        "step_id": "step-4",
                        "action": "take_screenshot",
                        "description": "Capture page screenshot verification",
                        "params": {},
                    },
                ],
                "metadata": {"category": "e2e", "author": "Frontend Team"},
            },
        ]
        return JSONResponse(content=templates)

    @router.post("/mcp/playwright/test")
    async def execute_playwright_test_workflow(workflow: TestWorkflow) -> JSONResponse:
        """Executes a JSON-defined browser test workflow against Playwright MCP and returns structured results."""
        try:
            result = await playwright_client.execute_workflow(workflow)
            return JSONResponse(content=result.model_dump())
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Playwright test execution failed: {str(exc)}")

    @router.get("/mcp/playwright/tools")
    async def list_playwright_mcp_tools() -> JSONResponse:
        """Lists all browser automation tools registered with the Playwright MCP server."""
        tools = await playwright_client.list_tools()
        return JSONResponse(content={"tools_count": len(tools), "tools": tools})

    return router
