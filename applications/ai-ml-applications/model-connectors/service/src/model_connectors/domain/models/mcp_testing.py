"""Domain models and JSON schema definitions for MCP Playwright Testing Workflows.

Adheres to strict JSON schema validation for automated browser testing workflows.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field


class StepAction(str, Enum):
    """Supported browser automation and assertion actions."""

    NAVIGATE = "navigate"
    CLICK = "click"
    TYPE = "type"
    PRESS_KEY = "press_key"
    WAIT_FOR = "wait_for"
    ASSERT_TEXT = "assert_text"
    ASSERT_VISIBLE = "assert_visible"
    ASSERT_TITLE = "assert_title"
    EVALUATE = "evaluate"
    SNAPSHOT = "snapshot"
    TAKE_SCREENSHOT = "take_screenshot"


class Step(BaseModel):
    """A discrete testing step within a test workflow."""

    step_id: str = Field(..., description="Unique step identifier, e.g. 'step-1'", examples=["step-1"])
    action: StepAction = Field(..., description="Action to perform via Playwright MCP", examples=[StepAction.NAVIGATE])
    description: str = Field(default="", description="Human-readable description of what this step validates")
    params: dict[str, Any] = Field(
        default_factory=dict,
        description="Action parameters: 'url' for navigate; 'selector'/'text' for click/assert; 'script' for evaluate",
        examples=[{"url": "http://model-connectors-ui:3000"}],
    )
    timeout_ms: int = Field(default=15000, description="Step execution timeout in milliseconds", ge=1000, le=120000)
    continue_on_error: bool = Field(default=False, description="Whether to continue subsequent steps if this step fails")


class Workflow(BaseModel):
    """Complete browser automation workflow represented as a JSON document."""

    workflow_id: str = Field(..., description="Unique workflow identifier", examples=["wf-modelbox-smoke-test"])
    name: str = Field(..., description="Display name for the test workflow", examples=["ModelBox UI Smoke Test"])
    description: str = Field(default="", description="Detailed summary of test scope and expectations")
    base_url: str = Field(default="", description="Optional base URL prefix for relative navigation paths", examples=["http://model-connectors-ui:3000"])
    timeout_ms: int = Field(default=60000, description="Overall workflow timeout in milliseconds", ge=5000, le=300000)
    steps: list[Step] = Field(..., description="Ordered list of testing steps to execute in sequence")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Custom metadata tags, author, environment")


# Domain alias without Test prefix
Case = Workflow


class StepResult(BaseModel):
    """Execution outcome for an individual test step."""

    step_id: str
    action: str
    description: str
    status: Literal["PASSED", "FAILED", "SKIPPED"]
    duration_ms: float
    details: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class WorkflowResult(BaseModel):
    """Aggregate result of an executed test workflow."""

    workflow_id: str
    name: str
    status: Literal["PASSED", "FAILED"]
    total_steps: int
    passed_steps: int
    failed_steps: int
    duration_ms: float
    step_results: list[StepResult]
    timestamp: str
    report_summary: str
