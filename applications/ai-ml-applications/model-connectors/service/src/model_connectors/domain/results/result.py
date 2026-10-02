"""Result monad implementation adhering to STD-COD-007.4.

Eliminates None returns and provides explicit success/failure domain semantics.
"""

from dataclasses import dataclass
from typing import Callable, Generic, NoReturn, TypeVar

T = TypeVar("T", covariant=True)
E = TypeVar("E", covariant=True)
U = TypeVar("U")


@dataclass(frozen=True)
class Success(Generic[T]):
    """Represents a successful operation carrying a value."""

    value: T

    @property
    def is_success(self) -> bool:
        """Indicates whether this result represents a success."""
        return True

    @property
    def is_failure(self) -> bool:
        """Indicates whether this result represents a failure."""
        return False

    def unwrap(self) -> T:
        """Extracts the underlying value."""
        return self.value

    def unwrap_or(self, default: object) -> T:
        """Returns the contained value regardless of default."""
        return self.value

    def map(self, fn: Callable[[T], U]) -> "Success[U]":
        """Transforms the contained value using the provided function."""
        return Success(fn(self.value))

    def bind(self, fn: Callable[[T], "Result[U, E]"]) -> "Result[U, E]":
        """Monadic bind operation for chaining Result-returning calls."""
        return fn(self.value)


@dataclass(frozen=True)
class Failure(Generic[E]):
    """Represents a failed operation carrying an error."""

    error: E

    @property
    def is_success(self) -> bool:
        """Indicates whether this result represents a success."""
        return False

    @property
    def is_failure(self) -> bool:
        """Indicates whether this result represents a failure."""
        return True

    def unwrap(self) -> NoReturn:
        """Raises ValueError because a failure contains no success value."""
        raise ValueError(f"Called unwrap on Failure: {self.error}")

    def unwrap_or(self, default: U) -> U:
        """Returns the fallback default value."""
        return default

    def map(self, fn: Callable[[object], object]) -> "Failure[E]":
        """Leaves failure unchanged across map."""
        return self

    def bind(self, fn: Callable[[object], "Result[object, E]"]) -> "Failure[E]":
        """Leaves failure unchanged across bind."""
        return self


Result = Success[T] | Failure[E]
