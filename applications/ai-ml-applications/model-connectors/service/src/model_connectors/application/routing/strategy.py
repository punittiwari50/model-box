"""Strategy Pattern implementation for Execution Flow Routing.

Strictly avoids if / if..else / switch statements by leveraging:
- Abstract Base Strategy contracts (GoF Strategy Pattern)
- Polymorphic dictionary dispatching
- Functional string formatting / prefix mapping
"""

from __future__ import annotations

from abc import ABC, abstractmethod
import os
from typing import Mapping

from model_connectors.application.routing.types import (
    ContainerServiceTarget,
    ExecutionRoutingMode,
    RoutingEndpointConfig,
)
from model_connectors.domain.constants import HttpConstants


class IRoutingStrategy(ABC):
    """Abstract Strategy interface defining execution routing contract."""

    @property
    @abstractmethod
    def mode(self) -> ExecutionRoutingMode:
        """The execution routing mode represented by this strategy."""
        ...

    @property
    @abstractmethod
    def is_direct_mesh(self) -> bool:
        """Whether this strategy routes directly to container mesh ports."""
        ...

    @abstractmethod
    def resolve_endpoint(self, target: ContainerServiceTarget, path: str) -> str:
        """Resolves target and relative path into a fully qualified execution endpoint."""
        ...

    @abstractmethod
    def resolve_headers(
        self,
        target: ContainerServiceTarget,
        custom_headers: Mapping[str, str] | None = None,
    ) -> dict[str, str]:
        """Resolves required HTTP headers for target service."""
        ...

    @abstractmethod
    def get_config(self, target: ContainerServiceTarget) -> RoutingEndpointConfig:
        """Retrieves structured endpoint configuration."""
        ...


class ServiceGatewayRoutingStrategy(IRoutingStrategy):
    """Default Secure Strategy: All execution flows through API Gateway (BFF).

    Enforces least privilege: prevents unauthorized external access to internal
    container ports, secrets (Vault), and direct persistence (PostgreSQL).
    """

    def __init__(self, gateway_base_url: str = "http://model-connectors-service:8000/api/v1") -> None:
        self._gateway_base_url = gateway_base_url.rstrip("/")
        # Path prefixer using boolean dispatch (Zero if-else)
        self._path_formatter = {
            True: lambda p: p,
            False: lambda p: f"/{p}",
        }

    @property
    def mode(self) -> ExecutionRoutingMode:
        return ExecutionRoutingMode.SERVICE_GATEWAY

    @property
    def is_direct_mesh(self) -> bool:
        return False

    def resolve_endpoint(self, target: ContainerServiceTarget, path: str) -> str:
        clean_path = self._path_formatter.get(path.startswith("/"), lambda p: f"/{p}")(path)
        return f"{self._gateway_base_url}{clean_path}"

    def resolve_headers(
        self,
        target: ContainerServiceTarget,
        custom_headers: Mapping[str, str] | None = None,
    ) -> dict[str, str]:
        headers: dict[str, str] = {
            HttpConstants.HEADER_CONTENT_TYPE: HttpConstants.CONTENT_TYPE_JSON,
            HttpConstants.HEADER_ACCEPT: HttpConstants.CONTENT_TYPE_JSON,
            "X-Execution-Route": self.mode.value,
        }
        headers.update(custom_headers or {})
        return headers

    def get_config(self, target: ContainerServiceTarget) -> RoutingEndpointConfig:
        return RoutingEndpointConfig(
            base_url=self._gateway_base_url,
            target=target,
            is_direct_mesh=False,
            default_headers=self.resolve_headers(target),
        )


class DirectContainerMeshRoutingStrategy(IRoutingStrategy):
    """Direct Container Mesh Strategy (Active ONLY when Feature Flag is ON).

    Enables direct sidecar/mesh interconnectivity:
    - Vault (:8200)
    - Database (:5432)
    - Ollama (:11434)
    - ComfyUI (:8188)
    - Playwright MCP (:8931)
    """

    def __init__(self, custom_endpoints: Mapping[ContainerServiceTarget, str] | None = None) -> None:
        # Default container topology registry
        defaults: dict[ContainerServiceTarget, str] = {
            ContainerServiceTarget.GATEWAY_SERVICE: os.getenv(
                "GATEWAY_URL", "http://model-connectors-service:8000/api/v1"
            ),
            ContainerServiceTarget.VAULT: os.getenv(
                "VAULT_URL", "http://model-connectors-vault:8200"
            ),
            ContainerServiceTarget.DATABASE: os.getenv(
                "POSTGRES_URL", "http://model-connectors-postgres:5432"
            ),
            ContainerServiceTarget.OLLAMA: os.getenv(
                "OLLAMA_URL", "http://ollama-model-service-gpu:11434"
            ),
            ContainerServiceTarget.COMFYUI: os.getenv(
                "COMFYUI_URL", "http://comfyui-model-service-gpu:8188"
            ),
            ContainerServiceTarget.PLAYWRIGHT_MCP: os.getenv(
                "PLAYWRIGHT_MCP_URL", "http://modelbox-playwright-mcp:8940"
            ),
        }
        defaults.update(custom_endpoints or {})
        self._endpoint_registry = defaults
        self._path_formatter = {
            True: lambda p: p,
            False: lambda p: f"/{p}",
        }

    @property
    def mode(self) -> ExecutionRoutingMode:
        return ExecutionRoutingMode.DIRECT_CONTAINER_MESH

    @property
    def is_direct_mesh(self) -> bool:
        return True

    def resolve_endpoint(self, target: ContainerServiceTarget, path: str) -> str:
        base = self._endpoint_registry.get(
            target, "http://model-connectors-service:8000/api/v1"
        ).rstrip("/")
        clean_path = self._path_formatter.get(path.startswith("/"), lambda p: f"/{p}")(path)
        return f"{base}{clean_path}"

    def resolve_headers(
        self,
        target: ContainerServiceTarget,
        custom_headers: Mapping[str, str] | None = None,
    ) -> dict[str, str]:
        headers: dict[str, str] = {
            HttpConstants.HEADER_CONTENT_TYPE: HttpConstants.CONTENT_TYPE_JSON,
            HttpConstants.HEADER_ACCEPT: HttpConstants.CONTENT_TYPE_JSON,
            "X-Execution-Route": self.mode.value,
            "X-Container-Target": target.value,
        }
        headers.update(custom_headers or {})
        return headers

    def get_config(self, target: ContainerServiceTarget) -> RoutingEndpointConfig:
        base = self._endpoint_registry.get(
            target, "http://model-connectors-service:8000/api/v1"
        )
        return RoutingEndpointConfig(
            base_url=base,
            target=target,
            is_direct_mesh=True,
            default_headers=self.resolve_headers(target),
        )
