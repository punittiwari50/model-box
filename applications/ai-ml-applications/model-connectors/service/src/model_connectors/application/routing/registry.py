"""Registry and State Manager coordinating Execution Flow Routing Strategies.

Enforces SOLID Open/Closed principle and GoF Strategy & State patterns.
Zero if / if..else / switch statements: All resolution and transitions
are dispatched via polymorphic dictionary mappings.
"""

from __future__ import annotations

import logging
from typing import Callable, Mapping

from model_connectors.application.routing.strategy import (
    DirectContainerMeshRoutingStrategy,
    IRoutingStrategy,
    ServiceGatewayRoutingStrategy,
)
from model_connectors.application.routing.types import (
    ContainerServiceTarget,
    ExecutionRoutingMode,
    RoutingEndpointConfig,
)

logger = logging.getLogger(__name__)


class RoutingStrategyRegistry:
    """Registry coordinating active execution flow routing across microservices.

    UI-to-Service is the default secure execution mode.
    Direct Container Mesh becomes active only when explicitly enabled.
    """

    def __init__(
        self,
        default_mode: ExecutionRoutingMode = ExecutionRoutingMode.SERVICE_GATEWAY,
        gateway_base_url: str = "http://model-connectors-service:8000/api/v1",
        custom_mesh_endpoints: Mapping[ContainerServiceTarget, str] | None = None,
    ) -> None:
        self._gateway_strategy = ServiceGatewayRoutingStrategy(gateway_base_url)
        self._mesh_strategy = DirectContainerMeshRoutingStrategy(custom_mesh_endpoints)

        # Polymorphic Strategy Registry
        self._strategy_map: dict[ExecutionRoutingMode, IRoutingStrategy] = {
            ExecutionRoutingMode.SERVICE_GATEWAY: self._gateway_strategy,
            ExecutionRoutingMode.DIRECT_CONTAINER_MESH: self._mesh_strategy,
        }

        # Toggle transition map (State pattern transition without if/else)
        self._toggle_map: dict[ExecutionRoutingMode, ExecutionRoutingMode] = {
            ExecutionRoutingMode.SERVICE_GATEWAY: ExecutionRoutingMode.DIRECT_CONTAINER_MESH,
            ExecutionRoutingMode.DIRECT_CONTAINER_MESH: ExecutionRoutingMode.SERVICE_GATEWAY,
        }

        self._active_mode = default_mode
        self._listeners: list[Callable[[ExecutionRoutingMode], None]] = []

    def get_active_strategy(self) -> IRoutingStrategy:
        """Retrieves currently active strategy via map lookup."""
        return self._strategy_map.get(self._active_mode, self._gateway_strategy)

    def get_mode(self) -> ExecutionRoutingMode:
        """Returns active execution mode."""
        return self._active_mode

    def is_direct_mesh(self) -> bool:
        """Returns whether direct mesh is active."""
        return self.get_active_strategy().is_direct_mesh

    def set_mode(self, mode: ExecutionRoutingMode) -> ExecutionRoutingMode:
        """Sets active execution mode using dictionary transition dispatcher (Zero if-else)."""
        valid_transition = mode in self._strategy_map
        action_dispatcher: dict[bool, Callable[[], None]] = {
            True: lambda: self._apply_mode(mode),
            False: lambda: None,
        }
        action_dispatcher.get(valid_transition, lambda: None)()
        return self._active_mode

    def _apply_mode(self, mode: ExecutionRoutingMode) -> None:
        self._active_mode = mode
        logger.info(f"Execution Routing Strategy transitioned to: {mode.value}")
        for listener in self._listeners:
            listener(self._active_mode)

    def toggle(self) -> ExecutionRoutingMode:
        """Toggles between SERVICE_GATEWAY and DIRECT_CONTAINER_MESH via toggle map."""
        next_mode = self._toggle_map.get(self._active_mode, ExecutionRoutingMode.SERVICE_GATEWAY)
        return self.set_mode(next_mode)

    def resolve_endpoint(self, target: ContainerServiceTarget, path: str) -> str:
        """Delegates endpoint resolution to active strategy."""
        return self.get_active_strategy().resolve_endpoint(target, path)

    def resolve_headers(
        self,
        target: ContainerServiceTarget,
        custom_headers: Mapping[str, str] | None = None,
    ) -> dict[str, str]:
        """Delegates header resolution to active strategy."""
        return self.get_active_strategy().resolve_headers(target, custom_headers)

    def get_config(self, target: ContainerServiceTarget) -> RoutingEndpointConfig:
        """Retrieves active configuration for target."""
        return self.get_active_strategy().get_config(target)

    def add_listener(self, listener: Callable[[ExecutionRoutingMode], None]) -> None:
        """Registers observer for routing mode changes."""
        self._listeners.append(listener)


# Global Singleton Registry initialized to default secure BFF flow
routing_registry = RoutingStrategyRegistry()
