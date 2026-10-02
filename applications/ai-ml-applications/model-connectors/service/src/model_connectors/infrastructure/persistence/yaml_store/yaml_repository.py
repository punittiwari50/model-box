"""YAML File-based Configuration Repository implementation adhering to STD-COD-005.

Allows declarative YAML file storage and loading for model connection profiles.
"""

from pathlib import Path
from typing import Any, Mapping, Sequence
import yaml

from model_connectors.infrastructure.utils.file_utils import FileUtils
from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.enums import (
    AuthMethod,
    ConnectionProtocol,
    StorageBackend,
)
from model_connectors.domain.ports.repositories import IConnectionConfigRepository
from model_connectors.domain.results.result import Failure, Result, Success


class YamlConnectionConfigRepository(IConnectionConfigRepository):
    """File-backed YAML persistence repository for model connectivity profiles."""

    def __init__(self, directory: Path | str = "./config") -> None:
        self._dir = Path(directory)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _file_for(self, connection_id: str) -> Path:
        """Determines YAML file path for a connection identifier."""
        return self._dir / f"{connection_id}.yaml"

    async def save_config(
        self, config: ModelConnectionConfig
    ) -> Result[None, DomainError]:
        """Serializes and writes model connection configuration to YAML file."""
        try:
            target_file = self._file_for(config.connection_id)
            data: dict[str, Any] = {
                "connection_id": config.connection_id,
                "name": config.name,
                "protocol": config.protocol.value,
                "endpoint_url": config.endpoint_url,
                "model_name": config.model_name,
                "auth_method": config.auth_method.value,
                "auth_payload": dict(config.auth_payload),
                "timeout_seconds": config.timeout_seconds,
                "max_retries": config.max_retries,
                "rate_limit_rpm": config.rate_limit_rpm,
                "token_capacity": config.token_capacity,
                "token_refill_rate_per_sec": config.token_refill_rate_per_sec,
                "storage_backend": StorageBackend.YAML.value,
            }
            dumped_content = yaml.safe_dump(data, sort_keys=False)
            write_res = FileUtils.write_text_atomic(target_file, dumped_content)
            if not write_res.is_success:
                return Failure(DomainError(write_res.error))
            return Success(None)
        except Exception as exc:
            return Failure(DomainError(f"Failed to write YAML config: {exc}"))

    async def get_config(
        self, connection_id: str
    ) -> Result[ModelConnectionConfig, DomainError]:
        """Loads and parses connection config from YAML file."""
        target_file = self._file_for(connection_id)
        if not target_file.exists():
            return Failure(DomainError(f"YAML config file for '{connection_id}' not found"))

        try:
            read_res = FileUtils.read_yaml(target_file)
            if not read_res.is_success:
                return Failure(DomainError(read_res.error))
            raw: Mapping[str, Any] = read_res.value

            config = ModelConnectionConfig(
                connection_id=str(raw["connection_id"]),
                name=str(raw["name"]),
                protocol=ConnectionProtocol(raw["protocol"]),
                endpoint_url=str(raw["endpoint_url"]),
                model_name=str(raw["model_name"]),
                auth_method=AuthMethod(raw.get("auth_method", "NONE")),
                auth_payload=dict(raw.get("auth_payload", {})),
                timeout_seconds=float(raw.get("timeout_seconds", 60.0)),
                max_retries=int(raw.get("max_retries", 3)),
                rate_limit_rpm=int(raw.get("rate_limit_rpm", 60)),
                token_capacity=int(raw.get("token_capacity", 100_000)),
                token_refill_rate_per_sec=float(raw.get("token_refill_rate_per_sec", 1_000.0)),
                storage_backend=StorageBackend.YAML,
            )
            return Success(config)
        except Exception as exc:
            return Failure(DomainError(f"Failed to parse YAML config: {exc}"))

    async def list_configs(
        self,
    ) -> Result[Sequence[ModelConnectionConfig], DomainError]:
        """Scans directory and returns all parsed YAML model connection profiles."""
        configs: list[ModelConnectionConfig] = []
        try:
            for yaml_file in self._dir.glob("*.yaml"):
                conn_id = yaml_file.stem
                res = await self.get_config(conn_id)
                if res.is_success:
                    configs.append(res.unwrap())
            return Success(configs)
        except Exception as exc:
            return Failure(DomainError(f"Error scanning YAML configs: {exc}"))

    async def delete_config(
        self, connection_id: str
    ) -> Result[None, DomainError]:
        """Deletes YAML configuration file."""
        target_file = self._file_for(connection_id)
        if target_file.exists():
            try:
                target_file.unlink()
                return Success(None)
            except Exception as exc:
                return Failure(DomainError(f"Failed to remove YAML config: {exc}"))
        return Success(None)
