"""Ollama REST API Connector implementation adhering to STD-COD-005 and STD-COD-007.

Connects to the Ollama container service running on model-box-net or localhost.
"""

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
    resolve_endpoint,
)


class RestOllamaConnector(IModelConnector):
    """Communicates with Ollama Docker service via HTTP REST endpoints."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    def _get_client(self, timeout_seconds: float) -> httpx.AsyncClient:
        """Returns injected or creates ephemeral async client."""
        if self._client is not None:
            return self._client
        return httpx.AsyncClient(timeout=timeout_seconds)

    async def execute_inference(
        self,
        request: InferenceRequest,
        config: ModelConnectionConfig,
    ) -> Result[InferenceResponse, DomainError]:
        """Sends chat request to Ollama endpoint and parses token usage metrics."""
        base_url = resolve_endpoint(config.endpoint_url, "http://ollama-model-service-gpu:11434")
        url = f"{base_url.rstrip('/')}/api/chat"
        payload = {
            "model": request.model_name or config.model_name,
            "messages": [{"role": "user", "content": request.prompt}],
            "stream": False,
            "options": request.parameters.get("options", {}),
        }
        headers = dict(config.auth_payload)
        start_time = time.monotonic()

        try:
            client = self._get_client(config.timeout_seconds)
            response = await client.post(url, json=payload, headers=headers)
            duration_ms = (time.monotonic() - start_time) * 1000.0

            if response.status_code != 200:
                err_text = response.text
                if "unknown model architecture: 'mllama'" in err_text and payload.get("model") != "llama3.2:latest":
                    # Transparently fall back to pure text llama3.2:latest
                    fallback_payload = dict(payload)
                    fallback_payload["model"] = "llama3.2:latest"
                    fallback_resp = await client.post(url, json=fallback_payload, headers=headers)
                    if fallback_resp.status_code == 200:
                        response = fallback_resp
                        duration_ms = (time.monotonic() - start_time) * 1000.0
                    else:
                        return Failure(
                            ModelConnectionError(
                                f"Ollama returned HTTP {fallback_resp.status_code}: {fallback_resp.text}",
                                {"endpoint": url, "status_code": str(fallback_resp.status_code)},
                            )
                        )
                else:
                    return Failure(
                        ModelConnectionError(
                            f"Ollama returned HTTP {response.status_code}: {err_text}",
                            {"endpoint": url, "status_code": str(response.status_code)},
                        )
                    )

            data: Mapping[str, Any] = response.json()
            message_obj = data.get("message", {})
            content = message_obj.get("content", "")

            # Extract token metrics from Ollama response
            prompt_tokens = int(data.get("prompt_eval_count", 0))
            completion_tokens = int(data.get("eval_count", 0))
            total_tokens = prompt_tokens + completion_tokens
            if total_tokens == 0:
                # Estimate if not provided
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

        except httpx.RequestError as exc:
            return Failure(
                ModelConnectionError(
                    f"Network error contacting Ollama at {url}: {exc}",
                    {"endpoint": url, "error": str(exc)},
                )
            )
        except Exception as exc:
            return Failure(
                ModelConnectionError(
                    f"Unexpected error in Ollama connector: {exc}",
                    {"error": str(exc)},
                )
            )

    async def check_health(
        self,
        config: ModelConnectionConfig,
    ) -> Result[HealthStatus, DomainError]:
        """Probes Ollama /api/tags endpoint to verify model service availability."""
        base_url = resolve_endpoint(config.endpoint_url, "http://ollama-model-service-gpu:11434")
        url = f"{base_url.rstrip('/')}/api/tags"
        start_time = time.monotonic()
        try:
            client = self._get_client(timeout_seconds=5.0)
            response = await client.get(url, headers=dict(config.auth_payload))
            latency = (time.monotonic() - start_time) * 1000.0

            if response.status_code == 200:
                tags = response.json().get("models", [])
                model_names = [m.get("name", "") for m in tags]
                return Success(
                    HealthStatus(
                        connection_id=config.connection_id,
                        state=ConnectorHealthState.HEALTHY,
                        latency_ms=latency,
                        details={
                            "available_models_count": str(len(model_names)),
                            "models": ", ".join(model_names[:5]),
                        },
                    )
                )

            return Success(
                HealthStatus(
                    connection_id=config.connection_id,
                    state=ConnectorHealthState.DEGRADED,
                    latency_ms=latency,
                    details={"http_status": str(response.status_code)},
                )
            )
        except Exception as exc:
            return Failure(
                ModelConnectionError(
                    f"Ollama health check failed at {url}: {exc}",
                    {"endpoint": url, "error": str(exc)},
                )
            )

    async def list_models(
        self,
        config: ModelConnectionConfig,
    ) -> Result[list[dict[str, Any]], DomainError]:
        """Queries Ollama /api/tags and returns full list of discovered models."""
        base_url = resolve_endpoint(config.endpoint_url, "http://ollama-model-service-gpu:11434")
        url = f"{base_url.rstrip('/')}/api/tags"
        try:
            client = self._get_client(timeout_seconds=5.0)
            response = await client.get(url, headers=dict(config.auth_payload))
            if response.status_code != 200:
                return Failure(
                    ModelConnectionError(
                        f"Failed to fetch Ollama models: HTTP {response.status_code}",
                        {"status": response.status_code},
                    )
                )

            data = response.json()
            models: list[dict[str, Any]] = []
            for item in data.get("models", []):
                details = item.get("details", {})
                size_mb = round(item.get("size", 0) / (1024 * 1024), 1)
                family = details.get("family", "N/A")
                is_supported = family != "mllama"
                models.append({
                    "name": item.get("name", ""),
                    "size_mb": size_mb,
                    "parameter_size": details.get("parameter_size", "N/A"),
                    "quantization": details.get("quantization_level", "N/A"),
                    "family": family,
                    "capabilities": item.get("capabilities", []),
                    "is_supported": is_supported,
                    "status_note": "" if is_supported else "Requires mllama runner",
                })
            # Prioritize llama3.2 on top, then llama3.1, then other supported models
            def model_priority(m: dict[str, Any]) -> int:
                name = m.get("name", "")
                if "llama3.2:" in name or name == "llama3.2":
                    return 0
                if "llama3.1" in name:
                    return 1
                if m.get("is_supported", True):
                    return 2
                return 3

            models.sort(key=model_priority)
            return Success(models)
        except Exception as exc:
            return Failure(
                ModelConnectionError(
                    f"Error listing Ollama models at {url}: {exc}",
                    {"endpoint": url, "error": str(exc)},
                )
            )
