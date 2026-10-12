"""Routing Strategy Module providing zero if/switch polymorphic execution flow control."""

from model_connectors.application.routing.registry import (
    RoutingStrategyRegistry,
    routing_registry,
)
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

__all__ = [
    "ContainerServiceTarget",
    "DirectContainerMeshRoutingStrategy",
    "ExecutionRoutingMode",
    "IRoutingStrategy",
    "RoutingEndpointConfig",
    "RoutingStrategyRegistry",
    "ServiceGatewayRoutingStrategy",
    "routing_registry",
]
