"""Search Strategy Port and Models adhering to SOLID principles and Strategy Pattern.

Eliminates if/else branching by dispatching search requests polymorphically across:
1. GoogleXRaySearchStrategy (Google Boolean syntax targeting official career portals)
2. OllamaAISearchStrategy (Ollama LLM deep semantic search & synthesis)
3. HybridEnterpriseSearchStrategy (Composite live X-Ray + AI reasoning pipeline)
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Protocol
from pydantic import BaseModel, Field

from model_connectors.domain.models.google_xray_search import (
    GoogleXRaySearchQuery,
    XRayBestPractice,
)
from model_connectors.domain.models.mcp_testing import Workflow


class SearchStrategyType(str, Enum):
    """Available search execution strategies."""

    ALL_STRATEGIES = "all_strategies"
    GOOGLE_XRAY = "google_xray"
    OLLAMA_AI = "ollama_ai"
    HYBRID_ENTERPRISE = "hybrid_enterprise"


class JobPaginationMetadata(BaseModel):
    """Pagination metadata for enterprise job search results adhering to SOLID."""

    current_page: int = Field(default=1, description="Current page number (1-indexed)")
    page_size: int = Field(default=10, description="Number of job cards per page")
    total_openings: int = Field(default=0, description="Total verified job openings available")
    total_pages: int = Field(default=1, description="Total number of pages")
    has_next_page: bool = Field(default=False, description="Whether subsequent page exists")
    has_previous_page: bool = Field(default=False, description="Whether previous page exists")
    showing_from: int = Field(default=1, description="First opening index on current page (1-indexed)")
    showing_to: int = Field(default=0, description="Last opening index on current page (1-indexed)")
    verified_count: int = Field(default=0, description="Total count of Schema.org verified jobs")


class SearchExecutionRequest(BaseModel):
    """Input request for search execution."""

    query: str = Field(default="Search job for spring boot sort by age")
    role: str = Field(default="Spring Boot")
    strategy_type: SearchStrategyType = Field(default=SearchStrategyType.ALL_STRATEGIES)
    time_filter: str = Field(default="d", description="'d' (past 24h) or 'w' (past week)")
    model_name: str = Field(default="qwen3:8b")
    candidate_skills: str = Field(default="Spring Boot, Microservices, Docker, Kubernetes, Distributed Systems")
    base_url: str = Field(default="https://careers.google.com")
    location: str = Field(default="Remote")
    page: int = Field(default=1, description="Requested page number (1-indexed)")
    page_size: int = Field(default=10, description="Number of job cards per page")


class SearchExecutionResult(BaseModel):
    """Unified output from search strategy execution."""

    strategy_used: SearchStrategyType
    role: str
    time_filter: str
    xray_query: GoogleXRaySearchQuery | None = None
    sorted_openings: list[dict[str, Any]] = Field(default_factory=list)
    paged_openings: list[dict[str, Any]] = Field(default_factory=list)
    pagination: JobPaginationMetadata | None = None
    job_match_score: dict[str, Any] | None = None
    conversational_message: str = ""
    workflow: Workflow | None = None
    applied_best_practices: list[XRayBestPractice] = Field(default_factory=list)
    aggregated_strategies: list[str] = Field(default_factory=list)
    execution_metadata: dict[str, Any] = Field(default_factory=dict)


class ISearchStrategy(Protocol):
    """Strategy interface for job search execution."""

    async def execute(self, req: SearchExecutionRequest) -> SearchExecutionResult:
        """Executes search and produces unified enterprise search result."""
        ...

