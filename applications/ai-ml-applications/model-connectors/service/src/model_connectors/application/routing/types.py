"""Routing targets and execution modes for microservices and container mesh."""

from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class ContainerServiceTarget(str, Enum):
    """Container services across the distributed microservices architecture."""

    GATEWAY_SERVICE = "GATEWAY_SERVICE"
    VAULT = "VAULT"
    DATABASE = "DATABASE"
    OLLAMA = "OLLAMA"
    COMFYUI = "COMFYUI"
    PLAYWRIGHT_MCP = "PLAYWRIGHT_MCP"


class ExecutionRoutingMode(str, Enum):
    """Security execution mode determining how client and microservices route traffic."""

    # Default secure BFF flow: all client traffic routes strictly through API Gateway
    SERVICE_GATEWAY = "SERVICE_GATEWAY"

    # Direct mesh access: active only when feature flag is explicitly enabled
    DIRECT_CONTAINER_MESH = "DIRECT_CONTAINER_MESH"


class RoutingEndpointConfig(BaseModel):
    """Configuration descriptor for a resolved endpoint."""

    base_url: str = Field(..., description="Base URL for target container or gateway")
    target: ContainerServiceTarget = Field(..., description="Target service enum")
    is_direct_mesh: bool = Field(..., description="Whether this connects directly to container port")
    default_headers: dict[str, str] = Field(default_factory=dict, description="Default headers for target")
