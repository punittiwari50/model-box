"""Unit tests for Result monad adhering to STD-COD-007.4."""

import pytest
from model_connectors.domain.results.result import Failure, Success


def test_success_monad_behavior() -> None:
    res = Success(42)
    assert res.is_success is True
    assert res.is_failure is False
    assert res.unwrap() == 42
    assert res.unwrap_or(0) == 42

    mapped = res.map(lambda x: x * 2)
    assert mapped.unwrap() == 84

    bound = res.bind(lambda x: Success(str(x)))
    assert bound.unwrap() == "42"


def test_failure_monad_behavior() -> None:
    res = Failure("invalid input")
    assert res.is_success is False
    assert res.is_failure is True
    assert res.error == "invalid input"
    assert res.unwrap_or(100) == 100

    with pytest.raises(ValueError):
        res.unwrap()

    mapped = res.map(lambda x: x * 2)
    assert mapped.is_failure is True
