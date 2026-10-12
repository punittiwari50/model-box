"""In-memory thread-safe implementation of IFlowRepository with deviation branching."""

from __future__ import annotations

import copy
from datetime import datetime, timezone
import logging
import threading
from typing import Any

from model_connectors.domain.models.flow_generation import FlowPurpose, WorkflowRecord
from model_connectors.domain.models.mcp_testing import Step, StepAction, Workflow
from model_connectors.domain.ports.flow_repository import IFlowRepository

logger = logging.getLogger(__name__)


class InMemoryFlowRepository(IFlowRepository):
    """Thread-safe in-memory store for Workflow flows with deviation versioning."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._flows: dict[str, WorkflowRecord] = {}
        self._seed_default_flows()

    def get_flow(self, flow_id: str) -> WorkflowRecord | None:
        with self._lock:
            return self._flows.get(flow_id)

    def list_flows(self, purpose: FlowPurpose | None = None) -> list[WorkflowRecord]:
        with self._lock:
            all_records = list(self._flows.values())
            if purpose:
                return [r for r in all_records if r.purpose == purpose]
            return all_records

    def create_flow(self, record: WorkflowRecord) -> WorkflowRecord:
        with self._lock:
            if record.flow_id in self._flows:
                raise ValueError(f"Flow '{record.flow_id}' already exists")
            record.updated_at = datetime.now(timezone.utc).isoformat()
            self._flows[record.flow_id] = record
            logger.info(f"Created flow record '{record.flow_id}' (version {record.version})")
            return record

    def update_flow(self, record: WorkflowRecord) -> WorkflowRecord:
        with self._lock:
            if record.flow_id not in self._flows:
                raise KeyError(f"Flow '{record.flow_id}' does not exist to update")
            record.updated_at = datetime.now(timezone.utc).isoformat()
            self._flows[record.flow_id] = record
            logger.info(f"Updated flow record '{record.flow_id}' (version {record.version})")
            return record

    def delete_flow(self, flow_id: str) -> bool:
        with self._lock:
            if flow_id in self._flows:
                del self._flows[flow_id]
                logger.info(f"Deleted flow record '{flow_id}'")
                return True
            return False

    def save_flow(self, record: WorkflowRecord) -> None:
        with self._lock:
            record.updated_at = datetime.now(timezone.utc).isoformat()
            self._flows[record.flow_id] = record
            logger.info(f"Saved flow record '{record.flow_id}' (version {record.version})")

    def create_deviation(
        self,
        base_flow_id: str,
        changes: dict[str, Any],
        deviation_summary: str | None = None,
    ) -> tuple[WorkflowRecord, WorkflowRecord]:
        """Creates a new deviation flow from base_flow_id preserving the original so both exist."""
        with self._lock:
            base_record = self._flows.get(base_flow_id)
            if not base_record:
                raise ValueError(f"Base flow '{base_flow_id}' not found to branch deviation from")

            # Determine deviation count for unique ID
            dev_count = sum(1 for r in self._flows.values() if r.parent_flow_id == base_flow_id) + 1
            new_flow_id = f"{base_flow_id}-dev-{dev_count}"
            new_version = base_record.version + 1

            # Clone base workflow and apply changes
            base_dict = base_record.flow.model_dump()
            updated_dict = self._apply_changes_to_dict(base_dict, changes)
            updated_dict["workflow_id"] = new_flow_id
            if "name" not in changes:
                updated_dict["name"] = f"{base_record.flow.name} (Deviation {dev_count})"

            # Build deviation summary if not provided
            summary = deviation_summary or f"Deviation {dev_count} branched from {base_flow_id} with updated steps/parameters"

            deviation_flow = Workflow.model_validate(updated_dict)
            deviation_record = WorkflowRecord(
                flow_id=new_flow_id,
                version=new_version,
                purpose=base_record.purpose,
                flow=deviation_flow,
                parent_flow_id=base_flow_id,
                is_deviation=True,
                deviation_summary=summary,
                data_source=base_record.data_source,
                metadata={
                    **base_record.metadata,
                    "branched_from": base_flow_id,
                    "applied_changes": list(changes.keys()),
                },
            )

            # Save the deviation record - both base_record and deviation_record are preserved!
            self._flows[new_flow_id] = deviation_record
            logger.info(f"Successfully created deviation '{new_flow_id}' from '{base_flow_id}'. Both flows exist.")
            return base_record, deviation_record

    def _apply_changes_to_dict(self, original: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
        """Applies shallow and deep changes to a Workflow dictionary."""
        result = copy.deepcopy(original)
        for k, v in changes.items():
            if k == "steps" and isinstance(v, list):
                # Replace or merge steps
                result["steps"] = v
            elif k in result and isinstance(result[k], dict) and isinstance(v, dict):
                result[k].update(v)
            else:
                result[k] = v
        return result

    def _seed_default_flows(self) -> None:
        """Seeds initial default test flows for job hunt and interview prep."""
        job_hunt_case = Workflow(
            workflow_id="wf-job-hunt-linkedin-v1",
            name="LinkedIn Job Hunt & Vacancy Discovery Workflow",
            description="Automated job listing search, location filtering, and vacancy inspection on ModelBox UI",
            base_url="http://model-connectors-ui:3000",
            timeout_ms=45000,
            steps=[
                Step(
                    step_id="step-1",
                    action=StepAction.NAVIGATE,
                    description="Navigate to ModelBox Web UI root",
                    params={"url": "http://model-connectors-ui:3000"},
                ),
                Step(
                    step_id="step-2",
                    action=StepAction.ASSERT_TITLE,
                    description="Verify page title contains ModelBox branding",
                    params={"expected_title": "ModelBox"},
                ),
                Step(
                    step_id="step-3",
                    action=StepAction.ASSERT_TEXT,
                    description="Assert presence of ModelBox | Connectors header",
                    params={"expected_text": "ModelBox | Connectors"},
                ),
                Step(
                    step_id="step-4",
                    action=StepAction.SNAPSHOT,
                    description="Capture DOM accessibility snapshot of job search state",
                    params={},
                ),
            ],
            metadata={"category": "job_hunt", "author": "ModelBox Engineering"},
        )
        self._flows["wf-job-hunt-linkedin-v1"] = WorkflowRecord(
            flow_id="wf-job-hunt-linkedin-v1",
            version=1,
            purpose=FlowPurpose.JOB_HUNT,
            flow=job_hunt_case,
            is_deviation=False,
            deviation_summary="Baseline LinkedIn job hunter verification flow",
        )
