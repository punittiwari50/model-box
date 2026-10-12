"""Playwright Test Flow Service layer connecting Ollama Qwen, Data Sources, and Playwright MCP.

Adheres to STD-COD-007.2 and implements deviation branching and dry-run execution.
"""

from __future__ import annotations

import logging
from typing import Any

from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.models.flow_generation import (
    FlowGenerationRequest,
    FlowGenerationResponse,
    FlowPurpose,
    WorkflowRecord,
)
from model_connectors.domain.models.mcp_testing import WorkflowResult
from model_connectors.domain.ports.flow_repository import IFlowRepository
from model_connectors.domain.results.result import Failure, Result, Success
from model_connectors.infrastructure.connectors.ollama_qwen_flow_generator import (
    OllamaQwenFlowGenerator,
)
from model_connectors.infrastructure.connectors.playwright_mcp_connector import (
    PlaywrightMcpConnector,
)
from model_connectors.infrastructure.data_sources.flow_data_extractor import (
    FlowDataExtractor,
)

logger = logging.getLogger(__name__)


class ManagePlaywrightFlowUseCase:
    """Service layer managing Playwright workflow generation, deviations, and MCP execution."""

    def __init__(
        self,
        flow_repo: IFlowRepository,
        qwen_generator: OllamaQwenFlowGenerator | None = None,
        playwright_connector: PlaywrightMcpConnector | None = None,
        data_extractor: FlowDataExtractor | None = None,
        project_repo: Any = None,
    ) -> None:
        self._flow_repo = flow_repo
        self._qwen_generator = qwen_generator or OllamaQwenFlowGenerator()
        self._playwright_connector = playwright_connector or PlaywrightMcpConnector()
        self._data_extractor = data_extractor or FlowDataExtractor()
        self._project_repo = project_repo

    async def generate_or_resolve_flow(
        self, request: FlowGenerationRequest
    ) -> Result[FlowGenerationResponse, DomainError]:
        """Core orchestration implementing flow reuse, deviation branching, and Qwen synthesis with dry runs."""
        try:
            # Step 1: Extract dynamic flow values from data source (Excel doc or Database)
            extracted_data = self._data_extractor.extract_data(
                request.data_source, project_repo=self._project_repo
            )
            if not extracted_data and request.target_role_or_query:
                extracted_data["target_role"] = request.target_role_or_query

            # Step 2: Check if flow exists
            existing_record: WorkflowRecord | None = None
            if request.flow_id:
                existing_record = self._flow_repo.get_flow(request.flow_id)

            if existing_record is not None:
                # -------------------------------------------------------------
                # CASE 1: Flow exists
                # -------------------------------------------------------------
                if request.existing_flow_changes:
                    # Changes requested: update deviation such that BOTH flows exist
                    base_record, dev_record = self._flow_repo.create_deviation(
                        base_flow_id=existing_record.flow_id,
                        changes=request.existing_flow_changes,
                        deviation_summary=f"Deviated from {existing_record.flow_id} with updated steps for {request.purpose.value}",
                    )

                    dry_run_res: WorkflowResult | None = None
                    if request.dry_run:
                        dry_run_res = await self._playwright_connector.execute_workflow(
                            dev_record.flow
                        )

                    return Success(
                        FlowGenerationResponse(
                            status="DEVIATION_CREATED",
                            flow_id=dev_record.flow_id,
                            version=dev_record.version,
                            active_flow=dev_record.flow,
                            base_flow=base_record.flow,
                            deviation_summary=dev_record.deviation_summary,
                            dry_run_result=dry_run_res,
                            extracted_data=extracted_data,
                            message=(
                                f"Created deviation '{dev_record.flow_id}' from base flow '{base_record.flow_id}'. "
                                "Both flows are preserved and exist."
                            ),
                        )
                    )
                else:
                    # Flow exists with no changes -> return existing flow
                    dry_run_res: WorkflowResult | None = None
                    if request.dry_run:
                        dry_run_res = await self._playwright_connector.execute_workflow(
                            existing_record.flow
                        )

                    return Success(
                        FlowGenerationResponse(
                            status="EXISTING",
                            flow_id=existing_record.flow_id,
                            version=existing_record.version,
                            active_flow=existing_record.flow,
                            base_flow=None,
                            deviation_summary=existing_record.deviation_summary,
                            dry_run_result=dry_run_res,
                            extracted_data=extracted_data,
                            message=f"Reused existing workflow '{existing_record.flow_id}'.",
                        )
                    )

            # -----------------------------------------------------------------
            # CASE 2: Flow does not exist -> dry run & generate the flow via Ollama Qwen
            # -----------------------------------------------------------------
            logger.info(
                f"Synthesizing new workflow for '{request.purpose.value}' using Ollama Qwen ({request.model_name})"
            )

            synthesis = await self._qwen_generator.generate_synthesis(
                purpose=request.purpose,
                target_role_or_query=request.target_role_or_query,
                base_url=request.base_url,
                extracted_data=extracted_data,
                sort_by=request.sort_by,
                user_query=request.user_query,
                model_name=request.model_name,
                ollama_endpoint=request.ollama_endpoint,
                use_google_xray=request.use_google_xray,
            )
            generated_workflow = synthesis.workflow

            # Assign consistent flow_id if not present
            flow_id = request.flow_id or f"wf-{request.purpose.value.replace('_', '-')}-{int(generated_workflow.timeout_ms)}"
            generated_workflow.workflow_id = flow_id

            # Execute dry run against containerized Playwright MCP if requested
            dry_run_res: WorkflowResult | None = None
            if request.dry_run:
                logger.info(f"Executing dry-run for generated flow '{flow_id}' against Playwright MCP")
                dry_run_res = await self._playwright_connector.execute_workflow(generated_workflow)

            # Persist newly generated flow record
            new_record = WorkflowRecord(
                flow_id=flow_id,
                version=1,
                purpose=request.purpose,
                flow=generated_workflow,
                is_deviation=False,
                data_source=request.data_source,
                metadata={
                    "model": request.model_name,
                    "target_role": request.target_role_or_query,
                    "sort_by": request.sort_by,
                    "use_google_xray": str(request.use_google_xray),
                    "dry_run_status": dry_run_res.status if dry_run_res else "NOT_RUN",
                },
            )
            self._flow_repo.save_flow(new_record)

            return Success(
                FlowGenerationResponse(
                    status="DRY_RUN_COMPLETED" if dry_run_res else "GENERATED",
                    flow_id=flow_id,
                    version=1,
                    active_flow=generated_workflow,
                    base_flow=None,
                    deviation_summary=None,
                    dry_run_result=dry_run_res,
                    extracted_data=extracted_data,
                    message=(
                        f"Generated new workflow '{flow_id}' for {request.purpose.value} using Qwen ({request.model_name}). "
                        f"Dry run status: {dry_run_res.status if dry_run_res else 'SKIPPED'}."
                    ),
                    conversational_message=synthesis.conversational_message,
                    sorted_openings=synthesis.sorted_openings,
                    image_artifacts=synthesis.image_artifacts,
                    xray_search_query=synthesis.xray_search_query,
                    job_match_score=synthesis.job_match_score,
                )
            )

        except Exception as exc:
            logger.error(f"Error in manage_playwright_flow_use_case: {exc}", exc_info=True)
            return Failure(DomainError(f"Flow generation error: {str(exc)}"))

    def list_flows(self, purpose: FlowPurpose | None = None) -> list[WorkflowRecord]:
        """Lists all flows and deviation branches."""
        return self._flow_repo.list_flows(purpose)

    def get_flow(self, flow_id: str) -> WorkflowRecord | None:
        """Retrieves a specific flow record."""
        return self._flow_repo.get_flow(flow_id)

    def create_flow(self, record: WorkflowRecord) -> WorkflowRecord:
        """Explicitly creates a new workflow record."""
        return self._flow_repo.create_flow(record)

    def update_flow(self, record: WorkflowRecord) -> WorkflowRecord:
        """Explicitly updates an existing workflow record."""
        return self._flow_repo.update_flow(record)

    def delete_flow(self, flow_id: str) -> bool:
        """Explicitly deletes a flow record by ID."""
        return self._flow_repo.delete_flow(flow_id)

