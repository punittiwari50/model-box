"""Unit tests for TokenBucketLimiter validating tokens consumed, available, and wait time."""

import time
from model_connectors.infrastructure.rate_limiting.token_bucket import TokenBucketLimiter


def test_token_bucket_initial_capacity() -> None:
    limiter = TokenBucketLimiter(default_capacity=10_000, default_refill_rate_per_sec=1_000.0)
    res = limiter.get_metrics("conn-test")
    assert res.is_success
    m = res.unwrap()
    assert m.bucket_capacity == 10_000
    assert m.tokens_available == 10_000
    assert m.tokens_consumed_total == 0
    assert m.wait_time_seconds == 0.0
    assert not m.is_throttled


def test_token_bucket_acquire_and_record() -> None:
    limiter = TokenBucketLimiter(default_capacity=1_000, default_refill_rate_per_sec=100.0)
    
    # 1. Acquire 400 tokens
    acq_res = limiter.acquire("conn-test", 400)
    assert acq_res.is_success
    m = acq_res.unwrap()
    assert m.tokens_available == 600
    assert m.tokens_consumed_total == 400

    # 2. Record actual tokens (e.g. 450 tokens actual from LLM)
    rec_res = limiter.record_consumption("conn-test", 450)
    assert rec_res.is_success
    m2 = rec_res.unwrap()
    assert m2.tokens_consumed_total == 450
    assert m2.tokens_available <= 550


def test_token_bucket_rate_limit_and_wait_time() -> None:
    limiter = TokenBucketLimiter(default_capacity=500, default_refill_rate_per_sec=50.0)
    
    # Empty the bucket
    limiter.acquire("conn-exhaust", 500)
    
    # Next request for 200 tokens must fail and report wait time
    fail_res = limiter.acquire("conn-exhaust", 200)
    assert fail_res.is_failure
    err = fail_res.error
    assert err.wait_time_seconds > 0.0
    # Wait time should be approx 200 / 50 = 4 seconds
    assert 3.5 <= err.wait_time_seconds <= 4.5
    assert err.tokens_requested == 200
