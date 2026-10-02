"""ComfyUI WebSocket and REST Connector implementation adhering to STD-COD-005.

Connects to the ComfyUI container service running on model-box-net or localhost.
Handles prompt queueing, real-time WebSocket progress updates, and output retrieval.
"""

from datetime import datetime, timezone
import json
import time
from typing import Any, Mapping
import uuid
import httpx
import websockets

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
    resolve_endpoint,
)


def _build_default_workflow(prompt_text: str) -> dict[str, Any]:
    """Generates a valid standard ComfyUI SDXL text-to-image workflow for prompt execution."""
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "juggernautXL_v9Rdphoto2.safetensors"}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, low quality, distorted", "clip": ["4", 1]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0], "seed": 42, "steps": 5, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ModelConnectors", "images": ["8", 0]}},
    }


class WebSocketComfyUIConnector(IModelConnector):
    """Orchestrates ComfyUI workflow prompt queueing and WebSocket event streaming."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    def _get_http_client(self, timeout_seconds: float) -> httpx.AsyncClient:
        """Returns injected or creates ephemeral async HTTP client."""
        if self._client is not None:
            return self._client
        return httpx.AsyncClient(timeout=timeout_seconds)

    def _build_ws_url(self, endpoint_url: str, client_id: str) -> str:
        """Constructs WebSocket endpoint URL from HTTP base URL."""
        clean_url = endpoint_url.rstrip("/")
        if clean_url.startswith("https://"):
            ws_base = "wss://" + clean_url[len("https://") :]
        elif clean_url.startswith("http://"):
            ws_base = "ws://" + clean_url[len("http://") :]
        else:
            ws_base = clean_url
        return f"{ws_base}/ws?clientId={client_id}"

    async def execute_inference(
        self,
        request: InferenceRequest,
        config: ModelConnectionConfig,
    ) -> Result[InferenceResponse, DomainError]:
        """Submits prompt workflow to ComfyUI across candidate endpoints with failover."""
        candidate_bases = resolve_candidate_endpoints(
            config.endpoint_url, "http://comfyui-model-service-gpu:8188"
        )
        workflow = request.parameters.get("workflow") or _build_default_workflow(request.prompt)

        last_error_details: dict[str, Any] = {}
        last_exception_msg = ""
        last_attempted_endpoint = ""
        effective_timeout = max(180.0, config.timeout_seconds)

        timeout_cfg = httpx.Timeout(
            timeout=effective_timeout,
            connect=15.0,
            read=effective_timeout,
            write=30.0,
            pool=30.0,
        )

        for base_url in candidate_bases:
            http_base = base_url.rstrip("/")
            client_id = f"client-{uuid.uuid4().hex[:8]}"
            ws_url = self._build_ws_url(http_base, client_id)
            queue_payload = {"prompt": workflow, "client_id": client_id}
            last_attempted_endpoint = http_base
            start_time = time.monotonic()

            try:
                async with httpx.AsyncClient(timeout=timeout_cfg) as client:
                    # 1. Connect WebSocket first to ensure no events are dropped
                    prompt_id: str | None = None
                    async with websockets.connect(ws_url, open_timeout=15.0, close_timeout=10.0) as ws:
                        # 2. Queue prompt via HTTP POST
                        queue_resp = await client.post(
                            f"{http_base}/prompt",
                            json=queue_payload,
                            headers=dict(config.auth_payload),
                        )
                        if queue_resp.status_code != 200:
                            last_exception_msg = f"ComfyUI rejected prompt: {queue_resp.text}"
                            last_error_details = {
                                "status_code": str(queue_resp.status_code),
                                "endpoint": http_base,
                            }
                            continue

                        prompt_data = queue_resp.json()
                        prompt_id = prompt_data.get("prompt_id", f"gen-{uuid.uuid4().hex[:8]}")

                        # 3. Listen to WebSocket messages until execution completes or timeout
                        executed_nodes: list[str] = []
                        while True:
                            raw_msg = await ws.recv()
                            if isinstance(raw_msg, str):
                                msg_data = json.loads(raw_msg)
                                msg_type = msg_data.get("type")
                                data_body = msg_data.get("data", {})

                                if msg_type == "executing":
                                    node = data_body.get("node")
                                    if node is None and data_body.get("prompt_id") == prompt_id:
                                        # Execution complete
                                        break
                                    elif node:
                                        executed_nodes.append(str(node))

                                elif msg_type == "execution_error":
                                    return Failure(
                                        ModelConnectionError(
                                            f"ComfyUI execution error: {data_body.get('exception_message')}",
                                            {"prompt_id": str(prompt_id), "endpoint": http_base},
                                        )
                                    )

                    duration_ms = (time.monotonic() - start_time) * 1000.0

                    # Estimate standardized tokens for diffusion compute: 200 base + 50 per node
                    equivalent_tokens = 200 + (len(executed_nodes) * 50)
                    token_metrics = TokenMetrics(
                        tokens_consumed_total=equivalent_tokens,
                        tokens_consumed_request=equivalent_tokens,
                        tokens_available=max(0, config.token_capacity - equivalent_tokens),
                        bucket_capacity=config.token_capacity,
                        refill_rate_per_second=config.token_refill_rate_per_sec,
                        wait_time_seconds=0.0,
                        is_throttled=False,
                        last_refill_timestamp=time.monotonic(),
                    )

                    result_content = (
                        f"ComfyUI workflow '{prompt_id}' executed successfully. "
                        f"Nodes processed: {len(executed_nodes)}. Execution time: {duration_ms:.1f}ms."
                    )

                    return Success(
                        InferenceResponse(
                            response_id=f"comfyui-{prompt_id}",
                            session_id=request.session_id,
                            content=result_content,
                            token_metrics=token_metrics,
                            execution_duration_ms=duration_ms,
                            raw_payload={
                                "prompt_id": prompt_id,
                                "client_id": client_id,
                                "nodes_executed": executed_nodes,
                                "active_endpoint": http_base,
                            },
                            timestamp=datetime.now(timezone.utc),
                        )
                    )

            except (websockets.exceptions.WebSocketException, OSError, httpx.RequestError) as exc:
                err_text = str(exc) or type(exc).__name__
                last_exception_msg = f"{type(exc).__name__}: {err_text}"
                last_error_details = {
                    "endpoint": http_base,
                    "ws_url": ws_url,
                    "error": last_exception_msg,
                }
                # Failover to next candidate endpoint
                continue
            except Exception as exc:
                err_text = str(exc) or type(exc).__name__
                last_exception_msg = f"{type(exc).__name__}: {err_text}"
                last_error_details = {
                    "endpoint": http_base,
                    "error": last_exception_msg,
                }
                break

        formatted_error = last_exception_msg or "All candidate ComfyUI endpoints unreachable"
        return Failure(
            ModelConnectionError(
                f"Network error contacting ComfyUI at {last_attempted_endpoint}: {formatted_error}",
                last_error_details or {"endpoint": last_attempted_endpoint, "error": formatted_error},
            )
        )

    async def check_health(
        self,
        config: ModelConnectionConfig,
    ) -> Result[HealthStatus, DomainError]:
        """Probes ComfyUI /system_stats endpoint for hardware and GPU status."""
        base_url = resolve_endpoint(config.endpoint_url, "http://comfyui-model-service-gpu:8188")
        url = f"{base_url.rstrip('/')}/system_stats"
        start_time = time.monotonic()
        try:
            client = self._get_http_client(timeout_seconds=5.0)
            response = await client.get(url, headers=dict(config.auth_payload))
            latency = (time.monotonic() - start_time) * 1000.0

            if response.status_code == 200:
                stats = response.json()
                system = stats.get("system", {})
                devices = stats.get("devices", [])
                gpu_name = devices[0].get("name", "Unknown GPU") if devices else "CPU"
                return Success(
                    HealthStatus(
                        connection_id=config.connection_id,
                        state=ConnectorHealthState.HEALTHY,
                        latency_ms=latency,
                        details={
                            "comfyui_version": str(system.get("comfyui_version", "unknown")),
                            "device": gpu_name,
                            "vram_free": str(devices[0].get("vram_free", 0) if devices else 0),
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
                    f"ComfyUI health check failed at {url}: {exc}",
                    {"endpoint": url, "error": str(exc)},
                )
            )

    async def list_models(
        self,
        config: ModelConnectionConfig,
    ) -> Result[list[dict[str, Any]], DomainError]:
        """Queries ComfyUI /object_info/CheckpointLoaderSimple to discover available checkpoint models."""
        base_url = resolve_endpoint(config.endpoint_url, "http://comfyui-model-service-gpu:8188")
        url = f"{base_url.rstrip('/')}/object_info/CheckpointLoaderSimple"
        try:
            client = self._get_http_client(timeout_seconds=5.0)
            response = await client.get(url, headers=dict(config.auth_payload))
            models: list[dict[str, Any]] = []
            if response.status_code == 200:
                data = response.json()
                checkpoints = (
                    data.get("CheckpointLoaderSimple", {})
                    .get("input", {})
                    .get("required", {})
                    .get("ckpt_name", [[]])[0]
                )
                for ckpt in checkpoints:
                    models.append({
                        "name": ckpt,
                        "parameter_size": "SDXL / Checkpoint",
                        "quantization": "safetensors",
                        "family": "Stable Diffusion",
                        "capabilities": ["image_generation"],
                    })
            if not models:
                models.append({"name": config.model_name})
            return Success(models)
        except Exception as exc:
            return Failure(
                ModelConnectionError(
                    f"Error listing ComfyUI checkpoints at {url}: {exc}",
                    {"endpoint": url, "error": str(exc)},
                )
            )
