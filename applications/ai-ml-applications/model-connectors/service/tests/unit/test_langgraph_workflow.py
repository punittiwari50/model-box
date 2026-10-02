"""Unit tests for LangGraph model connectors inference workflow."""

import pytest

from model_connectors.application.workflow.langgraph_workflow import (
    ModelConnectorsWorkflow,
    ModelInferenceState,
)
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.enums import ConnectionProtocol
from model_connectors.infrastructure.connectors.connector_factory import (
    ModelConnectorFactory,
)
from model_connectors.infrastructure.persistence.in_memory.sqlite_repository import (
    InMemorySqliteRepository,
)
from model_connectors.infrastructure.rate_limiting.token_bucket import (
    TokenBucketLimiter,
)


@pytest.mark.asyncio
async def test_workflow_execution_and_persistence() -> None:
    sqlite_repo = InMemorySqliteRepository(":memory:")
    token_limiter = TokenBucketLimiter(default_capacity=10_000, default_refill_rate_per_sec=500.0)
    factory = ModelConnectorFactory()

    workflow = ModelConnectorsWorkflow(
        token_limiter=token_limiter,
        session_repo=sqlite_repo,
        conversation_repo=sqlite_repo,
        connector_factory=factory,
    )

    config = ModelConnectionConfig(
        connection_id="test-grpc-conn",
        name="Test gRPC Model",
        protocol=ConnectionProtocol.GRPC,
        endpoint_url="grpc://localhost:50051",
        model_name="test-llm",
    )

    initial_state: ModelInferenceState = {
        "session_id": "sess-flow-01",
        "user_id": "eng-bob",
        "cookie_id": "cookie-bob-999",
        "prompt": "Explain quantum computing algorithms in 3 sentences.",
        "connection_id": "test-grpc-conn",
        "model_name": "test-llm",
        "config": config,
    }

    final_state = await workflow.execute(initial_state)

    assert not final_state.get("is_throttled")
    assert final_state.get("response_content") is not None
    assert final_state.get("token_metrics") is not None

    # Verify session and messages were persisted in database
    sess_res = await sqlite_repo.get_session("sess-flow-01")
    assert sess_res.is_success
    assert sess_res.unwrap().cookie_id == "cookie-bob-999"

    msgs_res = await sqlite_repo.get_messages("sess-flow-01")
    assert msgs_res.is_success
    msgs = msgs_res.unwrap()
    assert len(msgs) == 2  # 1 User message + 1 Assistant response
