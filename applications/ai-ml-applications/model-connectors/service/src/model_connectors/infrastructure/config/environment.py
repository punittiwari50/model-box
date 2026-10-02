"""Spring Boot Environment Interface and Externalized Configuration Hierarchy.

Adheres to:
1. Spring Boot Environment / PropertySource contract.
2. Single-point-of-access rule: `SystemEnvironmentPropertySource` is the EXCLUSIVE
   location in the entire project where `os.getenv` and `os.environ` are permitted.
3. Precedence hierarchy:
   [System Environment] -> overridden by [application.yml] -> overridden by [application-{profile}.yml]
   -> overridden by [Application Command Line Arguments].
4. Support for multiple active profiles provided via application.yml or CLI arguments.
"""

from abc import ABC, abstractmethod
from collections.abc import Mapping, Sequence
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Final, Protocol, TypeVar, runtime_checkable
import yaml

from model_connectors.domain.constants import ConfigKeyConstants, ProfileConstants
from model_connectors.infrastructure.utils.file_utils import FileUtils

T = TypeVar("T")


def _flatten_dict(d: Mapping[str, Any], parent_key: str = "", sep: str = ".") -> dict[str, Any]:
    """Recursively flattens nested dictionary keys into dot-notation strings."""
    items: list[tuple[str, Any]] = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else str(k)
        if isinstance(v, Mapping):
            items.extend(_flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
            # Also store with underscore substitution if applicable
            items.append((new_key.replace("-", "_"), v))
    return dict(items)


@runtime_checkable
class IPropertySource(Protocol):
    """Port interface for a named configuration property source."""

    @property
    def name(self) -> str:
        """Name identifying this property source."""
        ...

    def get_property(self, key: str) -> Any | None:
        """Resolves property value by key, returning None if absent."""
        ...

    def contains_property(self, key: str) -> bool:
        """Checks whether property is present in this source."""
        ...

    def get_all_properties(self) -> Mapping[str, Any]:
        """Returns read-only dictionary of all contained properties."""
        ...


class BasePropertySource(ABC, IPropertySource):
    """Abstract base class for property sources."""

    def __init__(self, name: str) -> None:
        self._name = name

    @property
    def name(self) -> str:
        return self._name


class MapPropertySource(BasePropertySource):
    """Property source backed by an in-memory dictionary with dot-notation lookup."""

    def __init__(self, name: str, source: Mapping[str, Any]) -> None:
        super().__init__(name)
        self._source: dict[str, Any] = _flatten_dict(source)
        # Retain raw unflattened map for structured lookups
        self._raw: dict[str, Any] = dict(source)

    def get_property(self, key: str) -> Any | None:
        if key in self._source:
            return self._source[key]
        normalized = key.replace("-", "_")
        if normalized in self._source:
            return self._source[normalized]
        # Check raw hierarchical dictionary
        parts = key.split(".")
        curr: Any = self._raw
        for part in parts:
            if isinstance(curr, Mapping) and part in curr:
                curr = curr[part]
            else:
                return None
        return curr

    def contains_property(self, key: str) -> bool:
        return self.get_property(key) is not None

    def get_all_properties(self) -> Mapping[str, Any]:
        return dict(self._source)


class SystemEnvironmentPropertySource(BasePropertySource):
    """EXCLUSIVE authority for host environment variable extraction across the codebase.

    STD-COD-002 ENFORCEMENT: No other module in this project may invoke `os.getenv`
    or inspect `os.environ`. All access is routed through this property source.
    """

    def __init__(self, name: str = "systemEnvironment") -> None:
        super().__init__(name)
        # Capture snapshot of os.environ in exactly this one place
        raw_env: dict[str, str] = dict(os.environ)
        self._env_data: dict[str, str] = {}

        for k, v in raw_env.items():
            self._env_data[k] = v
            # Normalization 1: lower-case dot-notation (APP_SERVER_PORT -> app.server.port)
            dot_key = k.lower().replace("_", ".")
            self._env_data[dot_key] = v
            # Normalization 2: standard Spring env mapping (SERVER_PORT -> server.port)
            if "_" in k:
                self._env_data[k.lower()] = v

        # Aliases for known enterprise container variables
        aliases = {
            "MODEL_BOX_OLLAMA_URL": "endpoints.ollama_url",
            "MODEL_BOX_COMFYUI_URL": "endpoints.comfyui_url",
            "MODEL_BOX_SQLITE_PATH": "storage.sqlite.db_path",
            "MODEL_BOX_YAML_DIR": "storage.yaml.config_dir",
            "MODEL_BOX_POSTGRES_DSN": "storage.postgres.dsn",
            "APP_HOST": "server.host",
            "APP_PORT": "server.port",
            "SPRING_PROFILES_ACTIVE": ConfigKeyConstants.SPRING_PROFILES_ACTIVE,
            "MODEL_BOX_PROFILES": ConfigKeyConstants.SPRING_PROFILES_ACTIVE,
        }
        for env_k, prop_k in aliases.items():
            if env_k in raw_env:
                self._env_data[prop_k] = raw_env[env_k]

    def get_property(self, key: str) -> Any | None:
        if key in self._env_data:
            return self._env_data[key]
        normalized = key.upper().replace(".", "_").replace("-", "_")
        return self._env_data.get(normalized)

    def contains_property(self, key: str) -> bool:
        return self.get_property(key) is not None

    def get_all_properties(self) -> Mapping[str, Any]:
        return dict(self._env_data)


class YamlPropertySource(MapPropertySource):
    """Property source loaded from a YAML configuration document."""

    def __init__(self, name: str, yaml_path: Path) -> None:
        data: dict[str, Any] = {}
        if yaml_path.exists():
            read_res = FileUtils.read_yaml(yaml_path)
            if read_res.is_success and isinstance(read_res.value, Mapping):
                data = dict(read_res.value)
        super().__init__(name, data)
        self.yaml_path = yaml_path


class CommandLinePropertySource(BasePropertySource):
    """Property source parsing command-line options (e.g., `--server.port=9000`)."""

    def __init__(self, args: Sequence[str] | None = None, name: str = "commandLineArgs") -> None:
        super().__init__(name)
        raw_args = list(args if args is not None else sys.argv[1:])
        self._parsed_args: dict[str, Any] = {}
        for arg in raw_args:
            if arg.startswith("--") and "=" in arg:
                key, val = arg[2:].split("=", 1)
                self._parsed_args[key.strip()] = val.strip()
                # Also support alias `--profiles=dev,docker` -> `spring.profiles.active`
                if key.strip() in ("profiles", "profile"):
                    self._parsed_args[ConfigKeyConstants.SPRING_PROFILES_ACTIVE] = val.strip()

    def get_property(self, key: str) -> Any | None:
        return self._parsed_args.get(key)

    def contains_property(self, key: str) -> bool:
        return key in self._parsed_args

    def get_all_properties(self) -> Mapping[str, Any]:
        return dict(self._parsed_args)


@runtime_checkable
class IEnvironment(Protocol):
    """High-level Spring Boot Environment interface."""

    def get_property(
        self,
        key: str,
        default: Any = None,
        target_type: type[T] | None = None,
    ) -> Any:
        """Retrieves property with optional type conversion and default fallback."""
        ...

    def get_required_property(
        self,
        key: str,
        target_type: type[T] | None = None,
    ) -> Any:
        """Retrieves property or raises ValueError if not found."""
        ...

    def get_active_profiles(self) -> tuple[str, ...]:
        """Returns currently active profiles sequence."""
        ...

    def get_default_profiles(self) -> tuple[str, ...]:
        """Returns fallback default profiles."""
        ...

    def accepts_profiles(self, *profiles: str) -> bool:
        """Checks whether any of the supplied profiles are currently active."""
        ...

    def get_property_sources(self) -> Sequence[IPropertySource]:
        """Returns all registered property sources in resolution order."""
        ...


class SpringEnvironment(IEnvironment):
    """Enterprise Spring Boot Environment implementation with multi-profile layering.

    ORDER OF PRECEDENCE (Highest to Lowest):
    1. Command Line Arguments (`--server.port=9000`)
    2. Active Profile YAMLs in order (`application-{profile_N}.yml` ... `application-{profile_1}.yml`)
    3. Base Application YAML (`application.yml`)
    4. System Environment Variables (`SystemEnvironmentPropertySource`)
    """

    def __init__(
        self,
        config_dir: Path | str | None = None,
        cli_args: Sequence[str] | None = None,
        explicit_profiles: Sequence[str] | None = None,
    ) -> None:
        self._config_dir = Path(config_dir) if config_dir else self._resolve_config_dir()
        if (self._config_dir / "properties").exists() and (self._config_dir / "properties" / "application.yml").exists():
            self._config_dir = self._config_dir / "properties"
        self._sources: list[IPropertySource] = []

        # 1. System Environment (Lowest priority base)
        sys_env = SystemEnvironmentPropertySource()

        # 2. Command Line Arguments (Highest priority for initial profile discovery)
        cli_source = CommandLinePropertySource(cli_args)

        # 3. Base YAML Source
        base_yaml_path = self._config_dir / "application.yml"
        base_yaml = YamlPropertySource("applicationConfig: [application.yml]", base_yaml_path)

        # Determine active profiles from:
        # a) explicit parameters
        # b) CLI argument `--spring.profiles.active` or `--profiles`
        # c) application.yml `spring.profiles.active`
        # d) system environment `SPRING_PROFILES_ACTIVE` or `MODEL_BOX_PROFILES`
        # e) default to `dev`
        active_profiles_raw: str | None = None
        if explicit_profiles:
            self._active_profiles = tuple(p.strip() for p in explicit_profiles if p.strip())
        else:
            cli_prof = cli_source.get_property(ConfigKeyConstants.SPRING_PROFILES_ACTIVE)
            yaml_prof = base_yaml.get_property(ConfigKeyConstants.SPRING_PROFILES_ACTIVE)
            env_prof = sys_env.get_property(ConfigKeyConstants.SPRING_PROFILES_ACTIVE)

            active_profiles_raw = cli_prof or yaml_prof or env_prof or ProfileConstants.DEV
            self._active_profiles = tuple(
                p.strip()
                for p in str(active_profiles_raw).replace(";", ",").split(",")
                if p.strip()
            )

        self._default_profiles: Final[tuple[str, ...]] = (ProfileConstants.DEFAULT,)

        # Build Profile YAML sources in ascending order (last profile has highest precedence)
        profile_sources: list[IPropertySource] = []
        for profile in self._active_profiles:
            profile_path = self._config_dir / f"application-{profile}.yml"
            if profile_path.exists():
                src = YamlPropertySource(
                    f"applicationConfig: [application-{profile}.yml]", profile_path
                )
                profile_sources.append(src)

        # Assemble Property Sources in Precedence Stack (Top = Highest Priority checked first):
        # 1. CLI arguments
        # 2. Profile YAMLs (in reverse order, so later profiles override earlier ones)
        # 3. Base application.yml
        # 4. System Environment
        self._sources.append(cli_source)
        for p_src in reversed(profile_sources):
            self._sources.append(p_src)
        self._sources.append(base_yaml)
        self._sources.append(sys_env)

    @staticmethod
    def _resolve_config_dir() -> Path:
        """Discovers the config directory looking up relative project directories."""
        candidates = [
            Path("./config/properties"),
            Path("./config"),
            Path(__file__).parent.parent.parent.parent / "config" / "properties",
            Path(__file__).parent.parent.parent.parent / "config",
            Path.cwd() / "config" / "properties",
            Path.cwd() / "config",
            Path("/app/config/properties"),
            Path("/app/config"),
        ]
        for c in candidates:
            if c.exists() and (c / "application.yml").exists():
                return c
        return Path("./config/properties") if Path("./config/properties").exists() else Path("./config")

    def get_property(
        self,
        key: str,
        default: Any = None,
        target_type: type[T] | None = None,
    ) -> Any:
        for source in self._sources:
            val = source.get_property(key)
            if val is not None:
                return self._convert_type(val, target_type)
        return default

    def get_required_property(
        self,
        key: str,
        target_type: type[T] | None = None,
    ) -> Any:
        val = self.get_property(key, default=None, target_type=target_type)
        if val is None:
            raise ValueError(f"Required configuration property '{key}' not found in any property source.")
        return val

    def get_active_profiles(self) -> tuple[str, ...]:
        return self._active_profiles

    def get_default_profiles(self) -> tuple[str, ...]:
        return self._default_profiles

    def accepts_profiles(self, *profiles: str) -> bool:
        active_set = set(self._active_profiles)
        return any(p in active_set for p in profiles)

    def get_property_sources(self) -> Sequence[IPropertySource]:
        return tuple(self._sources)

    @staticmethod
    def _convert_type(val: Any, target_type: type[T] | None) -> Any:
        if target_type is None or val is None or isinstance(val, target_type):
            return val

        def _to_bool(v: Any) -> bool:
            return v.lower() in ("true", "1", "yes", "on", "y") if isinstance(v, str) else bool(v)

        def _to_sequence(v: Any, seq_cls: type) -> Any:
            return seq_cls(x.strip() for x in v.split(",")) if isinstance(v, str) else seq_cls(v)

        converters: dict[type, Any] = {
            bool: _to_bool,
            int: int,
            float: float,
            list: lambda v: _to_sequence(v, list),
            tuple: lambda v: _to_sequence(v, tuple),
        }

        converter = converters.get(target_type, target_type)
        try:
            return converter(val)
        except Exception:
            return val

