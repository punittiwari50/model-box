"""Unit tests for ManagePlaywrightFlowUseCase, deviation branching, and Qwen synthesis."""

import pytest
from pathlib import Path

from model_connectors.application.use_cases.manage_playwright_flow_use_case import (
    ManagePlaywrightFlowUseCase,
)
from model_connectors.domain.models.flow_generation import (
    DataSourceType,
    FlowDataSource,
    FlowGenerationRequest,
    FlowPurpose,
)
from model_connectors.infrastructure.connectors.ollama_qwen_flow_generator import (
    OllamaQwenFlowGenerator,
)
from model_connectors.infrastructure.connectors.playwright_mcp_connector import (
    PlaywrightMcpConnector,
)
from model_connectors.infrastructure.data_sources.flow_data_extractor import (
    FlowDataExtractor,
)
from model_connectors.infrastructure.persistence.flow_repository import (
    InMemoryFlowRepository,
)


@pytest.fixture
def flow_use_case() -> ManagePlaywrightFlowUseCase:
    repo = InMemoryFlowRepository()
    qwen_gen = OllamaQwenFlowGenerator()
    playwright_conn = PlaywrightMcpConnector()
    extractor = FlowDataExtractor()
    return ManagePlaywrightFlowUseCase(
        flow_repo=repo,
        qwen_generator=qwen_gen,
        playwright_connector=playwright_conn,
        data_extractor=extractor,
    )


@pytest.mark.asyncio
async def test_flow_does_not_exist_generates_and_dry_runs(flow_use_case: ManagePlaywrightFlowUseCase) -> None:
    """When flow does not exist, synthesizes new flow via Qwen and executes dry-run."""
    req = FlowGenerationRequest(
        flow_id="wf-test-new-job-hunt",
        purpose=FlowPurpose.JOB_HUNT,
        target_role_or_query="Senior Python AI Engineer",
        base_url="http://model-connectors-ui:3000",
        data_source=FlowDataSource(
            source_type=DataSourceType.EXCEL_DOC,
            path_or_table="docs/job_hunt_candidates.csv",
        ),
        dry_run=False,  # Offline test mode
    )

    res = await flow_use_case.generate_or_resolve_flow(req)
    assert res.is_success
    output = res.unwrap()
    assert output.status in ("GENERATED", "DRY_RUN_COMPLETED")
    assert output.flow_id == "wf-test-new-job-hunt"
    assert output.version == 1
    assert len(output.active_flow.steps) > 0
    assert output.base_flow is None

    # Verify candidate data was extracted from CSV in docs
    assert output.extracted_data.get("full_name") == "Alex Morgan"


@pytest.mark.asyncio
async def test_flow_exists_with_changes_creates_deviation_preserving_both(
    flow_use_case: ManagePlaywrightFlowUseCase,
) -> None:
    """When flow exists and has changes, branches a deviation preserving both flows."""
    # 1. Base flow exists (seeded: wf-job-hunt-linkedin-v1)
    base_id = "wf-job-hunt-linkedin-v1"
    existing_record = flow_use_case.get_flow(base_id)
    assert existing_record is not None

    # 2. Request changes on existing flow
    req = FlowGenerationRequest(
        flow_id=base_id,
        purpose=FlowPurpose.JOB_HUNT,
        target_role_or_query="Principal LangGraph Architect",
        existing_flow_changes={
            "name": "Customized Job Hunt Deviation",
            "timeout_ms": 50000,
        },
        dry_run=False,
    )

    res = await flow_use_case.generate_or_resolve_flow(req)
    assert res.is_success
    output = res.unwrap()

    # 3. Verify deviation created and BOTH flows exist
    assert output.status == "DEVIATION_CREATED"
    assert output.flow_id.startswith(f"{base_id}-dev-")
    assert output.version == 2
    assert output.base_flow is not None
    assert output.base_flow.workflow_id == base_id

    # 4. Check repository has both base flow and deviation flow
    base_check = flow_use_case.get_flow(base_id)
    dev_check = flow_use_case.get_flow(output.flow_id)
    assert base_check is not None
    assert dev_check is not None
    assert dev_check.parent_flow_id == base_id
    assert dev_check.is_deviation is True


@pytest.mark.asyncio
async def test_all_four_purposes_synthesis(flow_use_case: ManagePlaywrightFlowUseCase) -> None:
    """Tests deterministic synthesis for Job Hunt, Interview Prep, App Prep, and Job Apply."""
    purposes = [
        FlowPurpose.JOB_HUNT,
        FlowPurpose.INTERVIEW_PREPARATION,
        FlowPurpose.JOB_APPLICATION_PREPARATION,
        FlowPurpose.JOB_APPLY,
    ]

    for p in purposes:
        req = FlowGenerationRequest(
            flow_id=f"wf-verify-{p.value}",
            purpose=p,
            target_role_or_query="Staff AI Engineer",
            data_source=FlowDataSource(
                source_type=DataSourceType.DIRECT_INPUT,
                query_params={"full_name": "Jordan Lee", "target_role": "Staff AI Engineer"},
            ),
            dry_run=False,
        )
        res = await flow_use_case.generate_or_resolve_flow(req)
        assert res.is_success
        flow = res.unwrap().active_flow
        assert len(flow.steps) >= 4
        assert any(s.action.value == "navigate" for s in flow.steps)
