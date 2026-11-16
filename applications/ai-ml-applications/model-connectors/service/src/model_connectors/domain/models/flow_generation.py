"""Domain models for Playwright MCP test flow generation, deviations, and data sources.

Supports AI-generated browser test flows using Ollama Qwen for:
- Job Hunt
- Interview Preparation
- Job Application Preparation
- Job Apply
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field

from model_connectors.domain.models.mcp_testing import Workflow, WorkflowResult


class FlowPurpose(str, Enum):
    """Business purpose for automated browser workflows."""

    JOB_HUNT = "job_hunt"
    JOB_DESCRIPTION_ANALYSIS = "job_description_analysis"
    INTERVIEW_PREPARATION = "interview_preparation"
    JOB_APPLICATION_PREPARATION = "job_application_preparation"
    JOB_APPLY = "job_apply"
    JOB_MATCH = "job_match"


class DataSourceType(str, Enum):
    """Source of truth for variable parameters injected into workflows."""

    DATABASE = "database"
    EXCEL_DOC = "excel_doc"
    DIRECT_INPUT = "direct_input"


class FlowDataSource(BaseModel):
    """Configuration identifying where workflow input parameters originate."""

    source_type: DataSourceType = Field(
        default=DataSourceType.DIRECT_INPUT,
        description="Type of data source: 'database', 'excel_doc', or 'direct_input'",
    )
    path_or_table: str = Field(
        default="",
        description="Path to Excel/CSV file (e.g. 'docs/job_hunt_candidates.csv') or database table/project identifier",
        examples=["docs/job_hunt_candidates.xlsx", "database:linkedin-job-hunter"],
    )
    sheet_name: str | None = Field(default=None, description="Optional Excel sheet name")
    row_or_key: str | None = Field(default=None, description="Optional row index or record identifier key")
    query_params: dict[str, Any] = Field(
        default_factory=dict,
        description="Explicit parameters or overrides for the flow values",
    )


class WorkflowRecord(BaseModel):
    """Persisted record of an automation workflow including versioning and deviation tracking."""

    flow_id: str = Field(..., description="Unique flow identifier", examples=["wf-job-hunt-linkedin-v1"])
    version: int = Field(default=1, description="Version number for this flow")
    purpose: FlowPurpose = Field(..., description="Business purpose of this flow")
    flow: Workflow = Field(..., description="The executable Workflow specification")
    parent_flow_id: str | None = Field(
        default=None,
        description="Reference to base flow ID if this record represents a deviation branch",
    )
    is_deviation: bool = Field(default=False, description="True if this flow was branched from a deviation")
    deviation_summary: str | None = Field(default=None, description="Summary of differences from the base flow")
    data_source: FlowDataSource | None = Field(default=None, description="Data source used to populate values")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def test_case(self) -> Workflow:
        """Backward-compatible property for flow."""
        return self.flow



class FlowGenerationRequest(BaseModel):
    """Request payload to generate, retrieve, or update a Playwright workflow."""

    flow_id: str | None = Field(
        default=None,
        description="Optional flow ID. If provided and flow exists, it will be reused or branched if changes exist.",
    )
    purpose: FlowPurpose = Field(
        default=FlowPurpose.JOB_HUNT,
        description="Purpose of the flow: 'job_hunt', 'interview_preparation', 'job_application_preparation', or 'job_apply'",
    )
    target_role_or_query: str = Field(
        default="Senior AI/ML Engineer",
        description="Target job title, interview topic, or application keywords",
        examples=["Senior Python AI Engineer", "System Design Mock Interview", "LinkedIn Easy Apply - Remote ML"],
    )
    base_url: str = Field(
        default="http://model-connectors-ui:3000",
        description="Base web application or target portal URL",
    )
    data_source: FlowDataSource | None = Field(
        default=None,
        description="Source where input values come from: excel in docs, database, or direct parameters",
    )
    existing_flow_changes: dict[str, Any] | None = Field(
        default=None,
        description="Changes to apply to an existing flow. If provided, creates a deviation preserving both flows.",
    )
    dry_run: bool = Field(
        default=True,
        description="Whether to perform a dry-run execution against Playwright MCP upon generation",
    )
    model_name: str = Field(
        default="qwen3:8b",
        description="Ollama model name to use for generation (defaults to qwen3:8b)",
    )
    ollama_endpoint: str | None = Field(
        default=None,
        description="Optional override for the Ollama REST endpoint",
    )
    user_query: str | None = Field(
        default=None,
        description="Natural language chat query (e.g. 'search job for spring boot sort by age')",
    )
    sort_by: str = Field(
        default="age",
        description="Ordering criteria for job openings: 'age' (most recent first), 'relevance', or 'salary'",
    )
    audio_transcript: str | None = Field(
        default=None,
        description="Transcribed voice prompt from microphone input",
    )
    image_url: str | None = Field(
        default=None,
        description="Optional base64 or URL of an attached image (job description screenshot or candidate profile)",
    )
    use_google_xray: bool = Field(
        default=False,
        description="When enabled, constructs and executes Google X-Ray Boolean queries across official company portals",
    )


class FlowGenerationResponse(BaseModel):
    """Response returned by the Playwright Flow Service layer."""

    status: Literal["EXISTING", "DEVIATION_CREATED", "GENERATED", "DRY_RUN_COMPLETED"]
    flow_id: str
    version: int
    active_flow: Workflow
    base_flow: Workflow | None = Field(
        default=None,
        description="The base/original flow when a deviation was created, ensuring both flows exist and are accessible",
    )
    deviation_summary: str | None = None
    dry_run_result: WorkflowResult | None = None
    extracted_data: dict[str, Any] = Field(default_factory=dict)
    message: str
    conversational_message: str | None = Field(
        default=None,
        description="Sequential conversational response generated by Qwen for the user",
    )
    sorted_openings: list[dict[str, Any]] = Field(
        default_factory=list,
        description="List of verified job openings sorted by age (newest/most recent first)",
    )
    image_artifacts: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Visual verification images associated with workflow stages",
    )
    xray_search_query: dict[str, Any] | None = Field(
        default=None,
        description="Structured Google X-Ray Boolean query information and URL if Google X-Ray was utilized",
    )
    job_match_score: dict[str, Any] | None = Field(
        default=None,
        description="Competency match percentage, alignment matrix, and skill gap analysis for Job Match",
    )
