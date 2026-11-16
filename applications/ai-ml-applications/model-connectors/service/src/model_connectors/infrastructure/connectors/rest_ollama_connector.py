"""Ollama REST API Connector implementation adhering to STD-COD-005 and STD-COD-007.

Connects to the Ollama container service running on model-box-net or localhost.
Features resilient multi-candidate endpoint failover, enterprise timeouts,
automatic retry with backoff, and transparent model fallback.
"""

import asyncio
from datetime import datetime, timezone
import time
from typing import Any, Mapping
import uuid
import httpx

from model_connectors.domain.exceptions.errors import (
    DomainError,
    ModelConnectionError,
)
from model_connectors.domain.models.connection_config import ModelConnectionConfig
from model_connectors.domain.models.enums import ConnectorHealthState
from model_connectors.domain.models.inference import (
    HealthStatus,
    InferenceRequest,
    InferenceResponse,
)
from model_connectors.domain.models.token_metrics import TokenMetrics
from model_connectors.domain.ports.connector import IModelConnector
from model_connectors.domain.results.result import Failure, Result, Success
from model_connectors.infrastructure.connectors.endpoint_resolver import (
    resolve_candidate_endpoints,
)


class RestOllamaConnector(IModelConnector):
    """Communicates with Ollama Docker service via HTTP REST endpoints."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    def _get_timeout(self, timeout_seconds: float) -> httpx.Timeout:
        """Returns structured enterprise timeout avoiding read/connect starvation."""
        effective_timeout = max(120.0, timeout_seconds)
        return httpx.Timeout(
            timeout=effective_timeout,
            connect=15.0,
            read=effective_timeout,
            write=30.0,
            pool=30.0,
        )

    def _get_client(self, timeout_seconds: float) -> httpx.AsyncClient:
        """Returns injected or creates ephemeral async client with proper timeouts."""
        if self._client is not None:
            return self._client
        return httpx.AsyncClient(timeout=self._get_timeout(timeout_seconds))

    async def _fetch_available_models(self, client: httpx.AsyncClient, base_url: str) -> list[str]:
        """Queries Ollama /api/tags to discover loaded models."""
        try:
            resp = await client.get(f"{base_url.rstrip('/')}/api/tags", timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                return [m.get("name") for m in data.get("models", []) if m.get("name")]
        except Exception:
            pass
        return []

    async def execute_inference(
        self,
        request: InferenceRequest,
        config: ModelConnectionConfig,
    ) -> Result[InferenceResponse, DomainError]:
        """Sends chat request to Ollama endpoint with multi-endpoint failover and retries."""
        candidate_bases = resolve_candidate_endpoints(
            config.endpoint_url, "http://ollama-model-service-gpu:11434"
        )
        headers = dict(config.auth_payload)
        desired_model = request.model_name or config.model_name or "llama3.2:latest"

        last_error_details: dict[str, Any] = {}
        last_exception_msg = ""
        last_attempted_url = ""

        timeout_cfg = self._get_timeout(config.timeout_seconds)

        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            for base_url in candidate_bases:
                clean_base = base_url.rstrip("/")
                chat_url = f"{clean_base}/api/chat"
                last_attempted_url = chat_url

                # Attempt up to max_retries per candidate endpoint
                max_attempts = max(1, min(config.max_retries, 3))
                for attempt in range(max_attempts):
                    start_time = time.monotonic()
                    payload = {
                        "model": desired_model,
                        "messages": [{"role": "user", "content": request.prompt}],
                        "stream": False,
                        "options": request.parameters.get("options", {}),
                    }

                    try:
                        response = await client.post(chat_url, json=payload, headers=headers)
                        duration_ms = (time.monotonic() - start_time) * 1000.0

                        # Handle 404 model not found -> fallback to existing model
                        if response.status_code == 404:
                            available = await self._fetch_available_models(client, clean_base)
                            if available and desired_model not in available:
                                fallback_model = (
                                    "tinyllama:latest"
                                    if "tinyllama:latest" in available
                                    else ("llama3.2:latest" if "llama3.2:latest" in available else available[0])
                                )
                                payload["model"] = fallback_model
                                response = await client.post(chat_url, json=payload, headers=headers)
                                duration_ms = (time.monotonic() - start_time) * 1000.0

                        if response.status_code != 200:
                            err_text = response.text
                            # Handle mllama architecture incompatibility fallback
                            if "unknown model architecture: 'mllama'" in err_text and payload.get("model") != "llama3.2:latest":
                                payload["model"] = "llama3.2:latest"
                                fallback_resp = await client.post(chat_url, json=payload, headers=headers)
                                if fallback_resp.status_code == 200:
                                    response = fallback_resp
                                    duration_ms = (time.monotonic() - start_time) * 1000.0
                                else:
                                    last_exception_msg = f"HTTP {fallback_resp.status_code}: {fallback_resp.text}"
                                    continue

                            if response.status_code != 200:
                                last_exception_msg = f"HTTP {response.status_code}: {err_text}"
                                continue

                        data: Mapping[str, Any] = response.json()
                        message_obj = data.get("message", {})
                        content = message_obj.get("content", "")

                        # Extract token metrics from Ollama response
                        prompt_tokens = int(data.get("prompt_eval_count", 0))
                        completion_tokens = int(data.get("eval_count", 0))
                        total_tokens = prompt_tokens + completion_tokens
                        if total_tokens == 0:
                            total_tokens = max(1, len(request.prompt.split()) + len(content.split()))

                        token_metrics = TokenMetrics(
                            tokens_consumed_total=total_tokens,
                            tokens_consumed_request=total_tokens,
                            tokens_available=max(0, config.token_capacity - total_tokens),
                            bucket_capacity=config.token_capacity,
                            refill_rate_per_second=config.token_refill_rate_per_sec,
                            wait_time_seconds=0.0,
                            is_throttled=False,
                            last_refill_timestamp=time.monotonic(),
                        )

                        inference_resp = InferenceResponse(
                            response_id=f"ollama-{uuid.uuid4().hex[:12]}",
                            session_id=request.session_id,
                            content=content,
                            token_metrics=token_metrics,
                            execution_duration_ms=duration_ms,
                            raw_payload=data,
                            timestamp=datetime.now(timezone.utc),
                        )
                        return Success(inference_resp)

                    except httpx.TimeoutException as exc:
                        last_exception_msg = (
                            f"Request timed out after {timeout_cfg.read}s waiting for Ollama model generation"
                        )
                        last_error_details = {
                            "endpoint": chat_url,
                            "error": last_exception_msg,
                            "error_type": "TimeoutException",
                            "attempt": attempt + 1,
                        }
                        if attempt < max_attempts - 1:
                            await asyncio.sleep(1.0 * (attempt + 1))
                            continue
                        break

                    except httpx.ConnectError as exc:
                        last_exception_msg = (
                            f"Connection refused to {chat_url}. Service may be starting or unreachable on this address"
                        )
                        last_error_details = {
                            "endpoint": chat_url,
                            "error": last_exception_msg,
                            "error_type": "ConnectError",
                            "attempt": attempt + 1,
                        }
                        # Immediately failover to next candidate endpoint
                        break

                    except httpx.RequestError as exc:
                        err_str = str(exc) or type(exc).__name__
                        last_exception_msg = f"{type(exc).__name__}: {err_str}"
                        last_error_details = {
                            "endpoint": chat_url,
                            "error": last_exception_msg,
                            "error_type": type(exc).__name__,
                            "attempt": attempt + 1,
                        }
                        if attempt < max_attempts - 1:
                            await asyncio.sleep(1.0 * (attempt + 1))
                            continue
                        break

                    except Exception as exc:
                        last_exception_msg = f"{type(exc).__name__}: {str(exc)}"
                        last_error_details = {
                            "endpoint": chat_url,
                            "error": last_exception_msg,
                            "error_type": type(exc).__name__,
                        }
                        break

        # If all candidates and retries failed, return comprehensive failure diagnostics
        formatted_error = last_exception_msg or "All candidate endpoints failed to respond"
        return Failure(
            ModelConnectionError(
                f"Network error contacting Ollama at {last_attempted_url}: {formatted_error}",
                last_error_details or {"endpoint": last_attempted_url, "error": formatted_error},
            )
        )

    async def check_health(
        self,
        config: ModelConnectionConfig,
    ) -> Result[HealthStatus, DomainError]:
        """Probes Ollama across candidate endpoints to verify availability."""
        candidates = resolve_candidate_endpoints(
            config.endpoint_url, "http://ollama-model-service-gpu:11434"
        )
        start_time = time.monotonic()
        timeout_cfg = httpx.Timeout(timeout=10.0, connect=5.0)

        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            for base_url in candidates:
                url = f"{base_url.rstrip('/')}/api/tags"
                try:
                    resp = await client.get(url, headers=dict(config.auth_payload))
                    latency = (time.monotonic() - start_time) * 1000.0
                    if resp.status_code == 200:
                        data = resp.json()
                        models = [m.get("name", "") for m in data.get("models", [])]
                        return Success(
                            HealthStatus(
                                is_healthy=True,
                                latency_ms=latency,
                                state=ConnectorHealthState.HEALTHY,
                                details={
                                    "status_code": 200,
                                    "models": models,
                                    "active_endpoint": base_url,
                                },
                            )
                        )
                except Exception:
                    continue

        return Success(
            HealthStatus(
                is_healthy=False,
                latency_ms=(time.monotonic() - start_time) * 1000.0,
                state=ConnectorHealthState.DEGRADED,
                details={"error": "All candidate Ollama endpoints unreachable"},
            )
        )
