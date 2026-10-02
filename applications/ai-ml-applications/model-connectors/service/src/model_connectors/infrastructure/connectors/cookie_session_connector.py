"""Cookie and Session-Authenticated AI Model Connector adhering to STD-COD-005.

Enables connectivity to web-based AI APIs requiring browser cookie headers,
session IDs, CSRF tokens, and user credentials.
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


class CookieSessionConnector(IModelConnector):
    """Executes model inference using session cookies and authenticated web headers."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    def _get_client(self, timeout_seconds: float) -> httpx.AsyncClient:
        """Returns injected or creates ephemeral async HTTP client."""
        if self._client is not None:
            return self._client
        return httpx.AsyncClient(timeout=timeout_seconds)

    def _build_cookie_header(
        self,
        config_auth: Mapping[str, str],
        cookie_id: str,
    ) -> str:
        """Assembles cookie header string from config and request session."""
        cookies: dict[str, str] = dict(config_auth)
        if cookie_id and "session_cookie" not in cookies:
            cookies["session_cookie"] = cookie_id
        return "; ".join(f"{k}={v}" for k, v in cookies.items() if not k.startswith("header_"))

    async def execute_inference(
        self,
        request: InferenceRequest,
        config: ModelConnectionConfig,
    ) -> Result[InferenceResponse, DomainError]:
        """Dispatches request with authenticated cookies and session headers."""
        url = config.endpoint_url.rstrip("/")
        start_time = time.monotonic()

        cookie_header = self._build_cookie_header(config.auth_payload, request.cookie_id)
        headers = {
            "Cookie": cookie_header,
            "X-Session-ID": request.session_id,
            "X-User-ID": request.user_id,
            "Content-Type": "application/json",
        }
        # Include custom headers from config
        for k, v in config.auth_payload.items():
            if k.startswith("header_"):
                headers[k[7:]] = v

        payload = {
            "prompt": request.prompt,
            "model": request.model_name or config.model_name,
            "session_id": request.session_id,
            "user_id": request.user_id,
            "parameters": request.parameters,
        }

        try:
            client = self._get_client(config.timeout_seconds)
            response = await client.post(url, json=payload, headers=headers)
            duration_ms = (time.monotonic() - start_time) * 1000.0

            if response.status_code != 200:
                return Failure(
                    ModelConnectionError(
                        f"Cookie session endpoint returned HTTP {response.status_code}: {response.text}",
                        {"endpoint": url, "status_code": str(response.status_code)},
                    )
                )

            data: Mapping[str, Any] = response.json()
            content = data.get("text") or data.get("response") or data.get("content", str(data))

            # Approximate token counts if not returned explicitly
            tokens = int(data.get("total_tokens", max(1, len(request.prompt.split()) + len(content.split()))))

            token_metrics = TokenMetrics(
                tokens_consumed_total=tokens,
                tokens_consumed_request=tokens,
                tokens_available=max(0, config.token_capacity - tokens),
                bucket_capacity=config.token_capacity,
                refill_rate_per_second=config.token_refill_rate_per_sec,
                wait_time_seconds=0.0,
                is_throttled=False,
                last_refill_timestamp=time.monotonic(),
            )

            return Success(
                InferenceResponse(
                    response_id=f"cookie-{uuid.uuid4().hex[:12]}",
                    session_id=request.session_id,
                    content=content,
                    token_metrics=token_metrics,
                    execution_duration_ms=duration_ms,
                    raw_payload=data,
                    timestamp=datetime.now(timezone.utc),
                )
            )

        except Exception as exc:
            return Failure(
                ModelConnectionError(
                    f"Cookie session request failed at {url}: {exc}",
                    {"endpoint": url, "error": str(exc)},
                )
            )

    async def check_health(
        self,
        config: ModelConnectionConfig,
    ) -> Result[HealthStatus, DomainError]:
        """Probes endpoint with session cookie validation."""
        url = config.endpoint_url.rstrip("/")
        start_time = time.monotonic()
        try:
            client = self._get_client(timeout_seconds=5.0)
            cookie_header = self._build_cookie_header(config.auth_payload, "probe-cookie")
            response = await client.get(url, headers={"Cookie": cookie_header})
            latency = (time.monotonic() - start_time) * 1000.0

            state = ConnectorHealthState.HEALTHY if response.status_code in (200, 404, 405) else ConnectorHealthState.DEGRADED
            return Success(
                HealthStatus(
                    connection_id=config.connection_id,
                    state=state,
                    latency_ms=latency,
                    details={"status_code": str(response.status_code)},
                )
            )
        except Exception as exc:
            return Failure(
                ModelConnectionError(
                    f"Cookie health check failed: {exc}",
                    {"endpoint": url, "error": str(exc)},
                )
            )

    async def list_models(
        self,
        config: ModelConnectionConfig,
    ) -> Result[list[dict[str, Any]], DomainError]:
        """Returns configured web AI model identifier."""
        return Success([{
            "name": config.model_name,
            "parameter_size": "Web Assistant",
            "quantization": "API",
            "family": "Web AI",
            "capabilities": ["text", "cookies"],
        }])
