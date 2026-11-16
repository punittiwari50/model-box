"""Enterprise File and Directory I/O Utilities adhering to STD-COD-003.

Centralizes path traversal protection, atomic file writes, chunked streaming reads,
and YAML parsing into a reusable utility class.
"""

from collections.abc import Generator
from pathlib import Path
from typing import Any
import yaml

from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.results.result import Failure, Result, Success


class FileUtils:
    """Enterprise file utility processing safe reading, writing, and path normalization."""

    @staticmethod
    def resolve_safe_path(base_dir: Path | str, relative_path: Path | str) -> Result[Path, DomainError]:
        """Resolves a path ensuring it does not escape base_dir (directory traversal prevention)."""
        try:
            base = Path(base_dir).resolve()
            target = (base / relative_path).resolve()
            if not str(target).startswith(str(base)):
                return Failure(
                    DomainError(f"Path traversal detected: {relative_path} attempts to escape {base}")
                )
            return Success(target)
        except Exception as e:
            return Failure(DomainError(f"Failed to resolve path: {e}"))

    @staticmethod
    def read_text(file_path: Path | str) -> Result[str, DomainError]:
        """Reads a UTF-8 text file cleanly returning a Result monad."""
        try:
            path = Path(file_path)
            if not path.is_file():
                return Failure(DomainError(f"File not found: {path}"))
            with open(path, "r", encoding="utf-8") as f:
                return Success(f.read())
        except Exception as e:
            return Failure(DomainError(f"Failed to read file {file_path}: {e}"))

    @staticmethod
    def write_text_atomic(file_path: Path | str, content: str) -> Result[Path, DomainError]:
        """Atomically writes content to a file via a temporary sibling file."""
        try:
            path = Path(file_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = path.with_suffix(f"{path.suffix}.tmp")
            with open(temp_path, "w", encoding="utf-8") as f:
                f.write(content)
            temp_path.replace(path)
            return Success(path)
        except Exception as e:
            return Failure(DomainError(f"Failed to write file {file_path}: {e}"))

    @staticmethod
    def read_yaml(file_path: Path | str) -> Result[dict[str, Any], DomainError]:
        """Parses a YAML file safely using yaml.safe_load."""
        read_res = FileUtils.read_text(file_path)
        if not read_res.is_success:
            return Failure(read_res.error)

        try:
            parsed = yaml.safe_load(read_res.value)
            return Success(parsed if isinstance(parsed, dict) else {})
        except Exception as e:
            return Failure(DomainError(f"Failed to parse YAML {file_path}: {e}"))

    @staticmethod
    def stream_binary_chunks(
        file_path: Path | str,
        start_byte: int = 0,
        chunk_size: int = 1024 * 1024,
        max_bytes: int | None = None,
    ) -> Generator[bytes, None, None]:
        """Streams binary chunks for HTTP range requests or large multimedia assets."""
        path = Path(file_path)
        if not path.is_file():
            return

        bytes_yielded = 0
        with open(path, "rb") as f:
            f.seek(start_byte)
            while True:
                remaining = max_bytes - bytes_yielded if max_bytes is not None else chunk_size
                if remaining <= 0:
                    break
                read_amount = min(chunk_size, remaining)
                chunk = f.read(read_amount)
                if not chunk:
                    break
                bytes_yielded += len(chunk)
                yield chunk
