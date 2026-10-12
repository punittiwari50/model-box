"""FastAPI Presentation Layer and Dependency Injection adhering to STD-COD-005.

Defines REST endpoints for projects, sessions, model connectors, token metrics, media, and Spring environment.
"""

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Mapping
import uuid
import httpx
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
    Workflow,
    WorkflowResult,
)
from model_connectors.domain.models.flow_generation import (
    FlowGenerationRequest,
    FlowPurpose,
    WorkflowRecord,
)
from model_connectors.application.use_cases.manage_playwright_flow_use_case import (
    ManagePlaywrightFlowUseCase,
)
from model_connectors.infrastructure.persistence.flow_repository import (
    InMemoryFlowRepository,
)
from model_connectors.application.routing import (
    ContainerServiceTarget,
    ExecutionRoutingMode,
    routing_registry,
)
from model_connectors.domain.models.trusted_portals import (
    TrustedPortalRegistry,
)
from model_connectors.domain.ports.connector import IUniversalModelConnector
from model_connectors.infrastructure.config.environment import IEnvironment
from model_connectors.infrastructure.connectors.playwright_mcp_connector import (
    PlaywrightMcpConnector,
)
from model_connectors.application.services.search_strategies import (
    AllStrategiesAggregatorStrategy,
    GoogleXRaySearchStrategy,
    HybridEnterpriseSearchStrategy,
    OllamaAISearchStrategy,
    SearchStrategyRegistry,
)
from model_connectors.domain.ports.search_strategy import (
    SearchExecutionRequest,
    SearchStrategyType,
)
from model_connectors.domain.ports.repositories import (
    IOfficialSchemaRepository,
    ITrustedPortalRepository,
    IXRayBestPracticeRepository,
)
from model_connectors.infrastructure.persistence.in_memory.sqlite_repository import (
    InMemorySqliteRepository,
)


def _serialize_entity(obj: Any) -> Any:
    """Recursively serializes Pydantic models, dataclasses, dicts, enums, and datetimes."""
    if hasattr(obj, "model_dump"):
        return _serialize_entity(obj.model_dump())
    elif hasattr(obj, "__dataclass_fields__"):
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


class HttpResultMapper:
    """Reusable SOLID Result-to-HTTP mapper eliminating if/switch branching across API routes."""

    @staticmethod
    def unwrap_or_raise(
        result: Result[Any, Any],
        status_on_failure: int = 500,
        not_found_on_none: bool = False,
        not_found_detail: str = "Requested resource not found",
    ) -> Any:
        failure_handlers: dict[bool, Callable[[], None]] = {
            True: lambda: (_ for _ in ()).throw(
                HTTPException(status_code=status_on_failure, detail=str(result.error))
            ),
            False: lambda: None,
        }
        failure_handlers[result.is_failure]()

        val = result.unwrap()
        none_handlers: dict[bool, Callable[[], None]] = {
            True: lambda: (_ for _ in ()).throw(
                HTTPException(status_code=404, detail=not_found_detail)
            ),
            False: lambda: None,
        }
        none_handlers[not_found_on_none and val is None]()
        return val


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
    flow_use_case: ManagePlaywrightFlowUseCase | None = None,
    xray_repo: Any = None,
    portal_repo: Any = None,
    schema_repo: Any = None,
) -> APIRouter:
    """Builds and returns the configured FastAPI APIRouter."""
    router = APIRouter(prefix="/api/v1")
    playwright_client = playwright_connector or PlaywrightMcpConnector()
    flow_service = flow_use_case or ManagePlaywrightFlowUseCase(
        flow_repo=InMemoryFlowRepository(),
        playwright_connector=playwright_client,
        project_repo=project_repo,
    )

    # Strategy Pattern: Google X-Ray Search & Ollama AI Search Engine Initialization
    xray_repository: IXRayBestPracticeRepository = (
        xray_repo
        if (xray_repo is not None and hasattr(xray_repo, "list_practices"))
        else (project_repo if (project_repo is not None and hasattr(project_repo, "list_practices")) else InMemorySqliteRepository())
    )
    portal_repository: ITrustedPortalRepository = (
        portal_repo
        if (portal_repo is not None and hasattr(portal_repo, "list_portals"))
        else (project_repo if (project_repo is not None and hasattr(project_repo, "list_portals")) else InMemorySqliteRepository())
    )
    schema_repository: IOfficialSchemaRepository = (
        schema_repo
        if (schema_repo is not None and hasattr(schema_repo, "list_schemas"))
        else (project_repo if (project_repo is not None and hasattr(project_repo, "list_schemas")) else InMemorySqliteRepository())
    )
    xray_strategy = GoogleXRaySearchStrategy(xray_repository)
    ai_strategy = OllamaAISearchStrategy(flow_service._qwen_generator)
    hybrid_strategy = HybridEnterpriseSearchStrategy(xray_strategy, ai_strategy)
    all_strategies = AllStrategiesAggregatorStrategy(xray_strategy, ai_strategy, playwright_client)
    search_registry = SearchStrategyRegistry(xray_strategy, ai_strategy, hybrid_strategy, all_strategies)

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
        """Returns the full JSON Schema definitions loaded from official specifications and DML."""
        schemas_res = await schema_repository.list_schemas()
        schemas_list = schemas_res.unwrap() if schemas_res.is_success else []
        return JSONResponse(
            content={
                "title": "ModelBox Enterprise MCP & Schema.org Official JSON Specification",
                "version": "2.0.0",
                "description": "Standard schemas for official Schema.org JobPosting and Playwright MCP browser automation loaded from DML",
                "official_schemas": schemas_list,
                "workflow_schema": Workflow.model_json_schema(),
                "workflow_result_schema": WorkflowResult.model_json_schema(),
            }
        )

    @router.get("/mcp/playwright/templates")
    async def get_playwright_test_templates() -> JSONResponse:
        """Returns official JSON testing workflow templates loaded from DML specifications."""
        schemas_res = await schema_repository.list_schemas()
        schemas_list = schemas_res.unwrap() if schemas_res.is_success else []
        templates = [s["sample_template"] for s in schemas_list if s.get("sample_template")]
        return JSONResponse(content=templates)

    @router.post("/mcp/playwright/test")
    async def execute_playwright_test_workflow(workflow: Workflow) -> JSONResponse:
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

    @router.post("/mcp/playwright/flow/generate")
    async def generate_playwright_flow(req: FlowGenerationRequest) -> JSONResponse:
        """Generates, deviates, or dry-runs a Playwright MCP test flow using Ollama Qwen."""
        res = await flow_service.generate_or_resolve_flow(req)
        if res.is_failure:
            raise HTTPException(status_code=500, detail=str(res.error))
        return JSONResponse(content=res.unwrap().model_dump())

    @router.get("/mcp/playwright/flows")
    async def list_playwright_flows(purpose: FlowPurpose | None = None) -> JSONResponse:
        """Returns all registered test flows, including deviation branches and versions."""
        flows = flow_service.list_flows(purpose)
        return JSONResponse(content=[f.model_dump() for f in flows])

    @router.get("/mcp/playwright/flow/{flow_id}")
    async def get_playwright_flow(flow_id: str) -> JSONResponse:
        """Retrieves a specific test flow record and its deviation metadata."""
        record = flow_service.get_flow(flow_id)
        if not record:
            raise HTTPException(status_code=404, detail=f"Flow '{flow_id}' not found")
        return JSONResponse(content=record.model_dump())

    @router.post("/mcp/playwright/flow")
    async def create_playwright_flow(record: WorkflowRecord) -> JSONResponse:
        """Creates a new workflow flow record in repository."""
        try:
            saved = flow_service.create_flow(record)
            return JSONResponse(status_code=201, content=saved.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

    @router.put("/mcp/playwright/flow/{flow_id}")
    async def update_playwright_flow(flow_id: str, record: WorkflowRecord) -> JSONResponse:
        """Updates an existing flow record in repository."""
        # Validate ID match without if-else
        mismatch_handler: dict[bool, Any] = {
            True: lambda: None,
            False: lambda: (_ for _ in ()).throw(HTTPException(status_code=400, detail="Mismatched flow_id in path and body")),
        }
        mismatch_handler.get(record.flow_id == flow_id, lambda: None)()
        try:
            updated = flow_service.update_flow(record)
            return JSONResponse(content=updated.model_dump())
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc))

    @router.delete("/mcp/playwright/flow/{flow_id}")
    async def delete_playwright_flow(flow_id: str) -> JSONResponse:
        """Deletes a flow record from repository."""
        deleted = flow_service.delete_flow(flow_id)
        deletion_handler: dict[bool, Any] = {
            True: lambda: JSONResponse(content={"deleted": True, "flow_id": flow_id}),
            False: lambda: (_ for _ in ()).throw(HTTPException(status_code=404, detail=f"Flow '{flow_id}' not found")),
        }
        return deletion_handler.get(deleted, lambda: None)()

    @router.get("/mcp/playwright/portals")
    async def get_trusted_portals() -> JSONResponse:
        """Returns official company portals and verification image artifact specifications loaded from DML."""
        portals_res = await portal_repository.list_portals()
        portals_data = portals_res.unwrap() if portals_res.is_success else []

        sync_dispatcher = {
            True: lambda: TrustedPortalRegistry.populate_from_records(portals_data),
            False: lambda: None,
        }
        sync_dispatcher.get(len(portals_data) > 0, lambda: None)()

        official_portals_map = {
            p["portal_id"]: {
                "company_name": p["company_name"],
                "official_domain": p["official_domain"],
                "portal_url": p["portal_url"],
                "portal_type": p["portal_type"],
                "logo_url": p["logo_url"],
                "logo_format": p.get("logo_format", "svg"),
                "verification_source": p.get("verification_source", "official_vector_cdn"),
                "search_url_template": p.get("search_url_template", ""),
                "supported_schemas": p.get("supported_schemas", ["https://schema.org/JobPosting"]),
            }
            for p in portals_data
        }
        fallback_portals_map = {
            k: {
                "company_name": v.company_name,
                "official_domain": v.official_domain,
                "portal_url": v.portal_url,
                "portal_type": v.portal_type,
                "logo_url": v.logo_url,
                "search_url_template": getattr(v, "search_url_template", ""),
            }
            for k, v in TrustedPortalRegistry.get_official_portals().items()
        }
        portals_selector = {
            True: official_portals_map,
            False: fallback_portals_map,
        }
        return JSONResponse(content={
            "official_portals": portals_selector.get(len(official_portals_map) > 0, fallback_portals_map),
            "image_artifacts": {
                k: v.model_dump() for k, v in TrustedPortalRegistry.STAGE_IMAGE_ARTIFACTS.items()
            },
        })

    # --------------------------------------------------------------------------
    # Job Requirements & Portal Listings Endpoints (Sorted strictly by First Listed Time)
    # --------------------------------------------------------------------------
    @router.get("/jobs")
    @router.get("/mcp/playwright/jobs")
    async def list_portal_jobs(sort_by: str = "first_listed") -> JSONResponse:
        """Returns verified job requirements from PostgreSQL/MCP, sorted strictly by first_listed_at DESC."""
        base_urls = [
            "http://modelbox-playwright-mcp:8940",
            "http://playwright-mcp:8940",
            "http://127.0.0.1:8940",
            "http://host.docker.internal:8940",
        ]
        async with httpx.AsyncClient(timeout=15.0) as client:
            for base_url in base_urls:
                try:
                    resp = await client.get(f"{base_url}/api/workflow/job-requirements")
                    if resp.status_code == 200:
                        return JSONResponse(content=resp.json())
                except Exception:
                    continue

        # Fallback to MCP tool call
        try:
            mcp_res = await playwright_client.call_tool("list_job_requirements", {})
            raw_text = playwright_client._extract_text_content(mcp_res)
            parsed = json.loads(raw_text) if raw_text else {}
            return JSONResponse(content=parsed)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to fetch job requirements: {str(exc)}")

    # --------------------------------------------------------------------------
    # Bidirectional Browser Authentication Cookies Endpoints
    # --------------------------------------------------------------------------
    @router.get("/jobs/cookies")
    @router.get("/mcp/playwright/cookies")
    async def get_browser_cookies() -> JSONResponse:
        """Fetches bidirectional cookie and session state status from MCP Chrome browser."""
        base_urls = [
            "http://modelbox-playwright-mcp:8940",
            "http://playwright-mcp:8940",
            "http://127.0.0.1:8940",
            "http://host.docker.internal:8940",
        ]
        async with httpx.AsyncClient(timeout=10.0) as client:
            for base_url in base_urls:
                try:
                    resp = await client.get(f"{base_url}/api/workflow/auth/cookies")
                    if resp.status_code == 200:
                        return JSONResponse(content=resp.json())
                except Exception:
                    continue

        try:
            mcp_res = await playwright_client.call_tool("get_auth_cookies", {})
            raw_text = playwright_client._extract_text_content(mcp_res)
            parsed = json.loads(raw_text) if raw_text else {}
            return JSONResponse(content=parsed)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to inspect cookies: {str(exc)}")

    @router.post("/jobs/cookies")
    @router.post("/mcp/playwright/cookies")
    async def import_browser_cookies(payload: dict[str, Any]) -> JSONResponse:
        """Imports cookies into the bidirectional storage_state.json for authenticated browsing."""
        base_urls = [
            "http://modelbox-playwright-mcp:8940",
            "http://playwright-mcp:8940",
            "http://127.0.0.1:8940",
            "http://host.docker.internal:8940",
        ]
        async with httpx.AsyncClient(timeout=10.0) as client:
            for base_url in base_urls:
                try:
                    resp = await client.post(f"{base_url}/api/workflow/auth/cookies", json=payload)
                    if resp.status_code == 200:
                        return JSONResponse(content=resp.json())
                except Exception:
                    continue

        try:
            mcp_res = await playwright_client.call_tool("import_auth_cookies", payload)
            raw_text = playwright_client._extract_text_content(mcp_res)
            parsed = json.loads(raw_text) if raw_text else {"success": True}
            return JSONResponse(content=parsed)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to import cookies: {str(exc)}")

    @router.get("/jobs/cookies/export")
    @router.get("/mcp/playwright/cookies/export")
    async def export_browser_cookies() -> JSONResponse:
        """Exports the saved authentication state from bidirectional storage_state.json."""
        base_urls = [
            "http://modelbox-playwright-mcp:8940",
            "http://playwright-mcp:8940",
            "http://127.0.0.1:8940",
            "http://host.docker.internal:8940",
        ]
        async with httpx.AsyncClient(timeout=10.0) as client:
            for base_url in base_urls:
                try:
                    resp = await client.get(f"{base_url}/api/workflow/auth/cookies/export")
                    if resp.status_code == 200:
                        return JSONResponse(content=resp.json())
                except Exception:
                    continue

        try:
            mcp_res = await playwright_client.call_tool("export_auth_cookies", {})
            raw_text = playwright_client._extract_text_content(mcp_res)
            parsed = json.loads(raw_text) if raw_text else {}
            return JSONResponse(content=parsed)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to export cookies: {str(exc)}")

    @router.delete("/jobs/cookies")
    @router.delete("/mcp/playwright/cookies")
    async def clear_browser_cookies() -> JSONResponse:
        """Clears saved browser cookies and authentication state."""
        base_urls = [
            "http://modelbox-playwright-mcp:8940",
            "http://playwright-mcp:8940",
            "http://127.0.0.1:8940",
            "http://host.docker.internal:8940",
        ]
        async with httpx.AsyncClient(timeout=10.0) as client:
            for base_url in base_urls:
                try:
                    resp = await client.delete(f"{base_url}/api/workflow/auth/cookies")
                    if resp.status_code == 200:
                        return JSONResponse(content=resp.json())
                except Exception:
                    continue
        return JSONResponse(content={"success": True, "message": "Cleared"})

    # --------------------------------------------------------------------------
    # Enterprise Google X-Ray Search & Strategy Pattern Endpoints (DML Backed)
    # --------------------------------------------------------------------------
    @router.get("/xray/practices")
    async def list_xray_practices(category: str | None = None) -> JSONResponse:
        """Returns all enterprise-grade Google X-Ray search best practices loaded from DML."""
        res = await xray_repository.list_practices(category)
        practices = HttpResultMapper.unwrap_or_raise(res)
        data = [_serialize_entity(p) for p in practices]
        return JSONResponse(content={"total_count": len(data), "practices": data})

    @router.post("/xray/search")
    async def execute_enterprise_search(req: SearchExecutionRequest) -> JSONResponse:
        """Executes enterprise search via Strategy Pattern (Google X-Ray, Ollama AI, or Hybrid)."""
        strategy = search_registry.get_strategy(req.strategy_type)
        result = await strategy.execute(req)
        return JSONResponse(content=result.model_dump())

    @router.get("/geography/current")
    async def get_current_geography() -> JSONResponse:
        """Returns detected user geographical location and metadata."""
        from model_connectors.domain.models.trusted_portals import UserGeographyResolver
        return JSONResponse(content=UserGeographyResolver.get_geography_details())

    # --------------------------------------------------------------------------
    # Security Feature Flag & Strategy Pattern Execution Flow Endpoints
    # --------------------------------------------------------------------------
    @router.get("/system/routing-mode")
    async def get_routing_mode() -> JSONResponse:
        """Retrieves active execution routing mode and strategy configuration."""
        active_mode = routing_registry.get_mode()
        strategy = routing_registry.get_active_strategy()
        targets = [t for t in ContainerServiceTarget]
        return JSONResponse(content={
            "mode": active_mode.value,
            "is_direct_mesh": strategy.is_direct_mesh,
            "strategy_class": strategy.__class__.__name__,
            "description": (
                "Direct Container Mesh is ON: Client/Node connects directly to individual containers"
                if strategy.is_direct_mesh
                else "Default Secure Flow: UI routes strictly to Service Gateway (BFF)"
            ),
            "endpoints": {
                target.value: routing_registry.resolve_endpoint(target, "")
                for target in targets
            },
        })

    @router.post("/system/routing-mode/toggle")
    async def toggle_routing_mode() -> JSONResponse:
        """Toggles between SERVICE_GATEWAY (default) and DIRECT_CONTAINER_MESH."""
        new_mode = routing_registry.toggle()
        return JSONResponse(content={
            "mode": new_mode.value,
            "is_direct_mesh": routing_registry.is_direct_mesh(),
            "message": f"Execution routing mode transitioned to {new_mode.value}",
        })

    @router.post("/system/routing-mode/set")
    async def set_routing_mode(payload: dict[str, str]) -> JSONResponse:
        """Explicitly sets execution routing mode."""
        requested = payload.get("mode", ExecutionRoutingMode.SERVICE_GATEWAY.value)
        mode_parser: dict[str, ExecutionRoutingMode] = {
            m.value: m for m in ExecutionRoutingMode
        }
        target_mode = mode_parser.get(requested, ExecutionRoutingMode.SERVICE_GATEWAY)
        applied_mode = routing_registry.set_mode(target_mode)
        return JSONResponse(content={
            "mode": applied_mode.value,
            "is_direct_mesh": routing_registry.is_direct_mesh(),
        })

    @router.get("/system/routing-mode/probe/{target}")
    async def probe_container_target(target: str) -> JSONResponse:
        """Probes container endpoint connectivity."""
        target_parser: dict[str, ContainerServiceTarget] = {
            t.value: t for t in ContainerServiceTarget
        }
        resolved_target = target_parser.get(target.upper(), ContainerServiceTarget.GATEWAY_SERVICE)
        url = routing_registry.resolve_endpoint(resolved_target, "")
        headers = routing_registry.resolve_headers(resolved_target)
        return JSONResponse(content={
            "target": resolved_target.value,
            "url": url,
            "headers": headers,
            "is_direct_mesh": routing_registry.is_direct_mesh(),
        })

    return router

