"""Execute Inference Orchestration Use Case adhering to STD-COD-007.2."""

from datetime import datetime, timezone
import uuid

from model_connectors.application.dto.inference_dto import (
    InferenceInputDTO,
    InferenceOutputDTO,
    TokenStatusDTO,
)
from model_connectors.application.use_cases.manage_connection_use_case import (
    ManageConnectionUseCase,
)
from model_connectors.application.workflow.langgraph_workflow import (
    ModelConnectorsWorkflow,
    ModelInferenceState,
)
from model_connectors.domain.exceptions.errors import DomainError
from model_connectors.domain.results.result import Failure, Result, Success


class ExecuteInferenceUseCase:
    """Orchestrates model inference dispatch through LangGraph workflow with token accounting."""

    def __init__(
        self,
        workflow: ModelConnectorsWorkflow,
        connection_use_case: ManageConnectionUseCase,
    ) -> None:
        self._workflow = workflow
        self._conn_use_case = connection_use_case

    async def execute(
        self, dto: InferenceInputDTO
    ) -> Result[InferenceOutputDTO, DomainError]:
        """Dispatches inference input DTO through LangGraph workflow and formats response DTO."""
        config_res = await self._conn_use_case.get_connection(dto.connection_id)
        if config_res.is_failure:
            return Failure(config_res.error)

        config = config_res.unwrap()
        initial_state: ModelInferenceState = {
            "session_id": dto.session_id,
            "user_id": dto.user_id,
            "cookie_id": dto.cookie_id,
            "prompt": dto.prompt,
            "connection_id": dto.connection_id,
            "model_name": dto.model_name or config.model_name,
            "parameters": dto.parameters,
            "config": config,
        }

        final_state = await self._workflow.execute(initial_state)

        if final_state.get("error") and not final_state.get("is_throttled"):
            return Failure(DomainError(f"Inference error: {final_state['error']}"))

        token_m = final_state.get("token_metrics")
        token_status = TokenStatusDTO(
            connection_id=dto.connection_id,
            tokens_consumed_total=token_m.tokens_consumed_total if token_m else 0,
            tokens_consumed_request=token_m.tokens_consumed_request if token_m else 0,
            tokens_available=token_m.tokens_available if token_m else config.token_capacity,
            bucket_capacity=token_m.bucket_capacity if token_m else config.token_capacity,
            percentage_available=token_m.percentage_available if token_m else 100.0,
            refill_rate_per_sec=token_m.refill_rate_per_second if token_m else config.token_refill_rate_per_sec,
            wait_time_seconds=final_state.get("wait_time_seconds", 0.0),
            wait_time_display=(
                f"{final_state['wait_time_seconds']:.1f}s"
                if final_state.get("wait_time_seconds", 0.0) > 0
                else "0s (Ready)"
            ),
            is_throttled=final_state.get("is_throttled", False),
        )

        output_dto = InferenceOutputDTO(
            response_id=f"resp-{uuid.uuid4().hex[:12]}",
            session_id=dto.session_id,
            content=final_state.get("response_content", ""),
            model_name=final_state.get("model_name", config.model_name),
            protocol=config.protocol.value,
            execution_duration_ms=final_state.get("duration_ms", 0.0),
            token_status=token_status,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        return Success(output_dto)
