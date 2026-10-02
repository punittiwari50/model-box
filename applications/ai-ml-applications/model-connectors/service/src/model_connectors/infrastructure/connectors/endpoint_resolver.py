"""Intelligent Endpoint Resolver adhering to SOLID principles and the Strategy Design Pattern.

Replaces procedural functions and if-else ladders with polymorphic resolution strategies.
Decouples container environment detection from raw os.getenv calls by delegating to IEnvironment.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Final, Sequence
from urllib.parse import urlparse, urlunparse

from model_connectors.domain.constants import EndpointConstants
from model_connectors.infrastructure.config.environment import (
    IEnvironment,
    SpringEnvironment,
)


@dataclass(frozen=True)
class EndpointContext:
    """Contextual metadata passed to endpoint resolution strategies."""

    target_url: str
    fallback_url: str = ""
    is_containerized: bool = False


class IEndpointResolutionStrategy(ABC):
    """Strategy interface for resolving network hostnames and endpoints."""

    @abstractmethod
    def can_resolve(self, context: EndpointContext) -> bool:
        """Determines if this strategy applies to the given endpoint context."""
        ...

    @abstractmethod
    def resolve(self, context: EndpointContext) -> str:
        """Transforms and resolves the endpoint URL."""
        ...


class DockerContainerResolutionStrategy(IEndpointResolutionStrategy):
    """Strategy resolving host loopbacks to Docker container DNS service hostnames."""

    def __init__(self) -> None:
        # Port and keyword to container destination mapping (Registry pattern)
        self._port_mappings: Final[dict[int, str]] = {
            8189: EndpointConstants.DEFAULT_COMFYUI_DOCKER,
            8188: EndpointConstants.DEFAULT_COMFYUI_DOCKER,
            11435: EndpointConstants.DEFAULT_OLLAMA_DOCKER,
            11434: EndpointConstants.DEFAULT_OLLAMA_DOCKER,
        }
        self._keyword_mappings: Final[dict[str, str]] = {
            "comfy": EndpointConstants.DEFAULT_COMFYUI_DOCKER,
            "ollama": EndpointConstants.DEFAULT_OLLAMA_DOCKER,
        }

    def can_resolve(self, context: EndpointContext) -> bool:
        return context.is_containerized

    def resolve(self, context: EndpointContext) -> str:
        parsed = urlparse(context.target_url)
        hostname = parsed.hostname or ""
        port = parsed.port

        # 1. Match known port mapping
        if port in self._port_mappings and hostname in ("127.0.0.1", "localhost", "0.0.0.0"):
            return self._port_mappings[port]

        # 2. Match keyword in URL
        url_lower = context.target_url.lower()
        for keyword, mapped_url in self._keyword_mappings.items():
            if keyword in url_lower:
                return mapped_url

        # 3. Fallback host gateway mapping
        if hostname in ("127.0.0.1", "localhost", "0.0.0.0"):
            new_netloc = (
                f"{EndpointConstants.DOCKER_HOST_FALLBACK}:{port}"
                if port
                else EndpointConstants.DOCKER_HOST_FALLBACK
            )
            return urlunparse(parsed._replace(netloc=new_netloc))

        return context.target_url


class LocalhostResolutionStrategy(IEndpointResolutionStrategy):
    """Strategy validating and normalizing standard host-level endpoints."""

    def can_resolve(self, context: EndpointContext) -> bool:
        # Applies when not running inside container or for general URLs
        return not context.is_containerized

    def resolve(self, context: EndpointContext) -> str:
        return context.target_url


class FallbackResolutionStrategy(IEndpointResolutionStrategy):
    """Null-object/Fallback strategy when input target is empty."""

    def can_resolve(self, context: EndpointContext) -> bool:
        return not bool(context.target_url)

    def resolve(self, context: EndpointContext) -> str:
        return context.fallback_url


class EndpointResolutionService:
    """Strategy Context coordinating endpoint resolution strategies (Composite/Strategy Pattern)."""

    def __init__(
        self,
        environment: IEnvironment | None = None,
        custom_strategies: Sequence[IEndpointResolutionStrategy] | None = None,
    ) -> None:
        self._env = environment or SpringEnvironment()
        self._strategies: list[IEndpointResolutionStrategy] = []

        if custom_strategies:
            self._strategies.extend(custom_strategies)
        else:
            # Register default strategies in priority order
            self._strategies.append(FallbackResolutionStrategy())
            self._strategies.append(DockerContainerResolutionStrategy())
            self._strategies.append(LocalhostResolutionStrategy())

    def is_container_environment(self) -> bool:
        """Determines if the active environment is a containerized runtime."""
        # Check active profiles or environment properties without scattered os.getenv
        if self._env.accepts_profiles("docker", "k8s", "prod"):
            return True
        # Check system property sources via Environment abstraction
        if self._env.get_property("docker.container") or self._env.get_property("container.name"):
            return True
        from pathlib import Path
        return Path("/.dockerenv").exists() or Path("/run/.containerenv").exists()

    def resolve(self, target_url: str, fallback_url: str = "") -> str:
        """Resolves target endpoint using the first matching polymorphic strategy."""
        context = EndpointContext(
            target_url=target_url,
            fallback_url=fallback_url,
            is_containerized=self.is_container_environment(),
        )
        for strategy in self._strategies:
            if strategy.can_resolve(context):
                return strategy.resolve(context)
        return target_url or fallback_url


# Global default service instance for backward-compatible functional facade
_default_service: EndpointResolutionService | None = None


def get_default_endpoint_resolver() -> EndpointResolutionService:
    global _default_service
    if _default_service is None:
        _default_service = EndpointResolutionService()
    return _default_service


def resolve_endpoint(endpoint_url: str, fallback_service_url: str = "") -> str:
    """Functional facade delegating to the OOP EndpointResolutionService strategy."""
    return get_default_endpoint_resolver().resolve(endpoint_url, fallback_service_url)


def is_running_in_docker() -> bool:
    """Functional facade querying OOP EndpointResolutionService."""
    return get_default_endpoint_resolver().is_container_environment()
