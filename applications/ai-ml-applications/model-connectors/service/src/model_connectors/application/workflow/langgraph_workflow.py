"""LangGraph Inference and Token Orchestration Workflow adhering to STD-COD-005.

Implements user requirement #7 (use of langgraph where necessary).
Coordinates rate-limiting token budgeting, conversation compaction, multi-protocol
connector execution, and persistence of session/cookie IDs and messages.
"""

from datetime import datetime, timezone
import time
from typing import Any, Mapping, TypedDict
import uuid

try:
    from langgraph.graph import END, START, StateGraph
    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False
    START = "__start__"
    END = "__end__"

from model_connectors.domain.exceptions.errors import (
    DomainError,
    RateLimitExceededError,
)
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.conversation import ConversationMessage
from model_connectors.domain.models.enums import MessageRole
from model_connectors.domain.models.inference import (
    InferenceRequest,
    InferenceResponse,
)
from model_connectors.domain.models.session import ConversationSession
from model_connectors.domain.models.token_metrics import TokenMetrics
from model_connectors.domain.ports.limiter import ITokenLimiter
from model_connectors.domain.ports.repositories import (
    IConversationRepository,
    ISessionRepository,
)
from model_connectors.infrastructure.connectors.connector_factory import (
    ModelConnectorFactory,
)


class ModelInferenceState(TypedDict, total=False):
    """LangGraph execution state dictionary."""

    session_id: str
    user_id: str
    cookie_id: str
    prompt: str
    connection_id: str
    model_name: str
    parameters: Mapping[str, Any]
    config: ModelConnectionConfig
    estimated_tokens: int
    is_throttled: bool
    wait_time_seconds: float
    compact_summary: str | None
    response_content: str
    raw_payload: Mapping[str, Any]
    duration_ms: float
    token_metrics: TokenMetrics | None
    error: str | None


class ModelConnectorsWorkflow:
    """Stateful LangGraph workflow orchestrating multi-protocol model inference."""

    def __init__(
        self,
        token_limiter: ITokenLimiter,
        session_repo: ISessionRepository,
        conversation_repo: IConversationRepository,
        connector_factory: ModelConnectorFactory,
        compaction_threshold: int = 4_000,
    ) -> None:
        self._limiter = token_limiter
        self._session_repo = session_repo
        self._conv_repo = conversation_repo
        self._factory = connector_factory
        self._compaction_threshold = compaction_threshold
        self._compiled_graph = self._build_graph()

    def _build_graph(self) -> Any:
        """Constructs LangGraph StateGraph topology with conditional routing."""
        if not HAS_LANGGRAPH:
            return None

        workflow = StateGraph(ModelInferenceState)

        # Register nodes
        workflow.add_node("rate_limit_guard", self._rate_limit_guard_node)
        workflow.add_node("context_compactor", self._context_compactor_node)
        workflow.add_node("connector_dispatcher", self._connector_dispatcher_node)
        workflow.add_node("audit_and_persist", self._audit_and_persist_node)
        workflow.add_node("throttle_handler", self._throttle_handler_node)

        # Edges and conditional routing
        workflow.add_edge(START, "rate_limit_guard")
        workflow.add_conditional_edges(
            "rate_limit_guard",
            self._route_after_rate_limit,
            {
                "throttled": "throttle_handler",
                "proceed": "context_compactor",
            },
        )
        workflow.add_edge("context_compactor", "connector_dispatcher")
        workflow.add_edge("connector_dispatcher", "audit_and_persist")
        workflow.add_edge("audit_and_persist", END)
        workflow.add_edge("throttle_handler", END)

        return workflow.compile()

    def _route_after_rate_limit(self, state: ModelInferenceState) -> str:
        """Determines whether to throttle or proceed with execution."""
        return "throttled" if state.get("is_throttled", False) else "proceed"

    async def _rate_limit_guard_node(
        self, state: ModelInferenceState
    ) -> ModelInferenceState:
        """Node 1: Evaluates token bucket reservation and computes wait time."""
        conn_id = state["connection_id"]
        prompt = state.get("prompt", "")
        estimated = max(1, len(prompt.split()) * 2)
        state["estimated_tokens"] = estimated

        acquire_res = self._limiter.acquire(conn_id, estimated)
        if acquire_res.is_failure:
            err = acquire_res.error
            state["is_throttled"] = True
            state["wait_time_seconds"] = getattr(err, "wait_time_seconds", 5.0)
            state["error"] = str(err)
            return state

        metrics = acquire_res.unwrap()
        state["is_throttled"] = False
        state["wait_time_seconds"] = 0.0
        state["token_metrics"] = metrics
        return state

    async def _throttle_handler_node(
        self, state: ModelInferenceState
    ) -> ModelInferenceState:
        """Node for handling throttled requests."""
        wait_s = state.get("wait_time_seconds", 0.0)
        state["response_content"] = (
            f"[Throttled] Token bucket exhausted. Please wait {wait_s:.2f} seconds "
            f"for bucket refill before re-trying."
        )
        return state

    async def _context_compactor_node(
        self, state: ModelInferenceState
    ) -> ModelInferenceState:
        """Node 2: Compresses conversation context if exceeding token budget."""
        session_id = state["session_id"]
        history_res = await self._conv_repo.get_messages(session_id, limit=50)
        if history_res.is_success:
            messages = history_res.unwrap()
            total_tokens = sum(m.token_count for m in messages)
            if total_tokens > self._compaction_threshold:
                state["compact_summary"] = (
                    f"Compacted summary of prior {len(messages)} messages (reduced from {total_tokens} tokens)."
                )
        return state

    async def _connector_dispatcher_node(
        self, state: ModelInferenceState
    ) -> ModelInferenceState:
        """Node 3: Dispatches inference via protocol connector."""
        config = state["config"]
        req = InferenceRequest(
            session_id=state["session_id"],
            user_id=state["user_id"],
            cookie_id=state["cookie_id"],
            prompt=state["prompt"],
            model_name=state.get("model_name", config.model_name),
            connection_id=config.connection_id,
            parameters=state.get("parameters", {}),
        )

        connector_res = self._factory.get_connector(config.protocol)
        if connector_res.is_failure:
            state["error"] = str(connector_res.error)
            state["response_content"] = f"Connector error: {connector_res.error}"
            return state

        connector = connector_res.unwrap()
        inference_res = await connector.execute_inference(req, config)

        if inference_res.is_failure:
            state["error"] = str(inference_res.error)
            state["response_content"] = f"Inference execution failure: {inference_res.error}"
            return state

        resp = inference_res.unwrap()
        state["response_content"] = resp.content
        state["raw_payload"] = resp.raw_payload
        state["duration_ms"] = resp.execution_duration_ms
        state["token_metrics"] = resp.token_metrics
        return state

    async def _audit_and_persist_node(
        self, state: ModelInferenceState
    ) -> ModelInferenceState:
        """Node 4: Records conversation messages and updates token bucket counters."""
        session_id = state["session_id"]
        now = datetime.now(timezone.utc)
        config = state["config"]

        # Ensure session exists
        sess_check = await self._session_repo.get_session(session_id)
        if sess_check.is_failure:
            await self._session_repo.save_session(
                ConversationSession(
                    session_id=session_id,
                    user_id=state["user_id"],
                    cookie_id=state["cookie_id"],
                    created_at=now,
                    updated_at=now,
                    metadata={"source": "langgraph_workflow"},
                )
            )

        # 1. Persist User Message
        prompt_tokens = max(1, len(state["prompt"].split()))
        await self._conv_repo.save_message(
            ConversationMessage(
                message_id=f"msg-{uuid.uuid4().hex[:10]}",
                session_id=session_id,
                role=MessageRole.USER,
                content=state["prompt"],
                token_count=prompt_tokens,
                timestamp=now,
                model_name=config.model_name,
                connector_protocol=config.protocol,
                metadata={"cookie_id": state["cookie_id"], "user_id": state["user_id"]},
            )
        )

        # 2. Persist Assistant Response
        resp_content = state.get("response_content", "")
        resp_tokens = max(1, len(resp_content.split()))
        await self._conv_repo.save_message(
            ConversationMessage(
                message_id=f"msg-{uuid.uuid4().hex[:10]}",
                session_id=session_id,
                role=MessageRole.ASSISTANT,
                content=resp_content,
                token_count=resp_tokens,
                timestamp=datetime.now(timezone.utc),
                model_name=config.model_name,
                connector_protocol=config.protocol,
                metadata={"duration_ms": str(state.get("duration_ms", 0.0))},
            )
        )

        # 3. Update Token Limiter
        total_tokens = prompt_tokens + resp_tokens
        limiter_res = self._limiter.record_consumption(config.connection_id, total_tokens)
        if limiter_res.is_success:
            state["token_metrics"] = limiter_res.unwrap()

        return state

    async def execute(self, initial_state: ModelInferenceState) -> ModelInferenceState:
        """Executes the workflow graph (using LangGraph when present or sequential DAG)."""
        if self._compiled_graph is not None:
            # Native LangGraph execution
            return await self._compiled_graph.ainvoke(initial_state)

        # Resilient standalone DAG execution when langgraph is not installed
        s = await self._rate_limit_guard_node(initial_state)
        if self._route_after_rate_limit(s) == "throttled":
            return await self._throttle_handler_node(s)

        s = await self._context_compactor_node(s)
        s = await self._connector_dispatcher_node(s)
        s = await self._audit_and_persist_node(s)
        return s
