"""Port interface for storing and managing Playwright automation workflow flows and deviation branches."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from model_connectors.domain.models.flow_generation import FlowPurpose, WorkflowRecord


class IFlowRepository(ABC):
    """Repository managing automation workflows with full CRUD and deviation branching."""

    @abstractmethod
    def create_flow(self, record: WorkflowRecord) -> WorkflowRecord:
        """Creates a new workflow flow record. Fails if ID already exists."""
        ...

    @abstractmethod
    def get_flow(self, flow_id: str) -> WorkflowRecord | None:
        """Retrieves a flow record by ID."""
        ...

    @abstractmethod
    def update_flow(self, record: WorkflowRecord) -> WorkflowRecord:
        """Updates an existing flow record. Fails if flow does not exist."""
        ...

    @abstractmethod
    def delete_flow(self, flow_id: str) -> bool:
        """Deletes a flow record by ID. Returns True if deleted, False if not found."""
        ...

    @abstractmethod
    def list_flows(self, purpose: FlowPurpose | None = None) -> list[WorkflowRecord]:
        """Lists all stored flows, optionally filtered by business purpose."""
        ...

    @abstractmethod
    def save_flow(self, record: WorkflowRecord) -> None:
        """Saves or updates a flow record (upsert)."""
        ...

    @abstractmethod
    def create_deviation(
        self,
        base_flow_id: str,
        changes: dict[str, Any],
        deviation_summary: str | None = None,
    ) -> tuple[WorkflowRecord, WorkflowRecord]:
        """Creates a new deviation flow from base_flow_id preserving the original so both exist."""
        ...
