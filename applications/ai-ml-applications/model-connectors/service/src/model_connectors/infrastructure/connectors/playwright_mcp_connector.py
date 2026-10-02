"""Enterprise Model Context Protocol (MCP) Playwright Connector and Test Workflow Runner.

Connects to the Playwright MCP container service, executes JSON-driven browser automation
workflows, and returns structured test results and assertion metrics.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from model_connectors.domain.models.mcp_testing import (
    StepResult,
    TestStep,
    TestStepAction,
    TestWorkflow,
    TestWorkflowResult,
)

logger = logging.getLogger(__name__)


class PlaywrightMcpConnector:
    """Connector to the containerized Playwright MCP server."""

    def __init__(self, endpoint_url: str | None = None, timeout_seconds: float = 60.0) -> None:
        self.endpoint_url = endpoint_url or os.getenv(
            "PLAYWRIGHT_MCP_URL", "http://playwright-mcp:8931/mcp"
        )
        self.timeout_seconds = timeout_seconds
        self._session_id: str | None = None
        self._rpc_id = 0

    def _next_id(self) -> int:
        self._rpc_id += 1
        return self._rpc_id

    def _get_candidate_endpoints(self) -> list[str]:
        """Provides failover candidate endpoints for Docker networks and localhost."""
        candidates = [self.endpoint_url]
        if "playwright-mcp" in self.endpoint_url:
            candidates.append(self.endpoint_url.replace("playwright-mcp", "127.0.0.1"))
            candidates.append(self.endpoint_url.replace("playwright-mcp", "host.docker.internal"))
        elif "127.0.0.1" in self.endpoint_url or "localhost" in self.endpoint_url:
            candidates.append(self.endpoint_url.replace("127.0.0.1", "playwright-mcp").replace("localhost", "playwright-mcp"))
        return candidates

    async def _ensure_session(self, client: httpx.AsyncClient, endpoint: str) -> str:
        """Initializes or reuses an active MCP SSE session with the Playwright server."""
        if self._session_id:
            return self._session_id

        init_payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "modelbox-service", "version": "2.0.0"},
            },
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Host": "localhost:8931",
        }

        resp = await client.post(endpoint, json=init_payload, headers=headers, timeout=15.0)
        resp.raise_for_status()
        sess_id = resp.headers.get("mcp-session-id")
        if not sess_id:
            raise RuntimeError(f"Playwright MCP did not return mcp-session-id header from {endpoint}")
        self._session_id = sess_id
        logger.info(f"Connected to Playwright MCP at {endpoint}, session_id={self._session_id}")
        return self._session_id

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Executes an MCP tool call on the remote Playwright MCP container."""
        candidates = self._get_candidate_endpoints()
        last_error: Exception | None = None

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for endpoint in candidates:
                try:
                    sess_id = await self._ensure_session(client, endpoint)
                    payload = {
                        "jsonrpc": "2.0",
                        "id": self._next_id(),
                        "method": "tools/call",
                        "params": {"name": tool_name, "arguments": arguments},
                    }
                    headers = {
                        "Content-Type": "application/json",
                        "Accept": "application/json, text/event-stream",
                        "Host": "localhost:8931",
                        "mcp-session-id": sess_id,
                    }
                    resp = await client.post(endpoint, json=payload, headers=headers)
                    if resp.status_code == 404 or resp.status_code == 400:
                        # Session may have expired on server restart; retry once with new session
                        self._session_id = None
                        sess_id = await self._ensure_session(client, endpoint)
                        headers["mcp-session-id"] = sess_id
                        resp = await client.post(endpoint, json=payload, headers=headers)

                    resp.raise_for_status()
                    raw_text = resp.text

                    # Parse SSE data payload
                    for line in raw_text.splitlines():
                        if line.startswith("data: "):
                            data = json.loads(line[6:])
                            if "result" in data:
                                return data["result"]
                            elif "error" in data:
                                raise RuntimeError(f"Playwright MCP RPC error: {data['error']}")

                    return {"content": [{"type": "text", "text": raw_text}]}
                except Exception as exc:
                    logger.warning(f"Error calling Playwright MCP at {endpoint}: {exc}")
                    last_error = exc
                    self._session_id = None

        raise RuntimeError(f"Failed to execute Playwright MCP tool '{tool_name}' across all candidates: {last_error}")

    async def list_tools(self) -> list[dict[str, Any]]:
        """Retrieves list of tools available in Playwright MCP."""
        candidates = self._get_candidate_endpoints()
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for endpoint in candidates:
                try:
                    sess_id = await self._ensure_session(client, endpoint)
                    payload = {"jsonrpc": "2.0", "id": self._next_id(), "method": "tools/list", "params": {}}
                    headers = {
                        "Content-Type": "application/json",
                        "Accept": "application/json, text/event-stream",
                        "Host": "localhost:8931",
                        "mcp-session-id": sess_id,
                    }
                    resp = await client.post(endpoint, json=payload, headers=headers)
                    resp.raise_for_status()
                    for line in resp.text.splitlines():
                        if line.startswith("data: "):
                            data = json.loads(line[6:])
                            return data.get("result", {}).get("tools", [])
                except Exception as exc:
                    logger.warning(f"Failed to query tools from {endpoint}: {exc}")
                    self._session_id = None

        return []

    async def execute_workflow(self, workflow: TestWorkflow) -> TestWorkflowResult:
        """Executes a JSON-defined browser test workflow against Playwright MCP."""
        start_time = time.perf_counter()
        step_results: list[StepResult] = []
        overall_passed = True

        logger.info(f"Starting execution of test workflow '{workflow.name}' ({workflow.workflow_id})")

        for step in workflow.steps:
            step_start = time.perf_counter()
            step_status: str = "PASSED"
            error_msg: str | None = None
            details: dict[str, Any] = {}

            try:
                details = await self._execute_step(step, workflow.base_url)
            except Exception as exc:
                step_status = "FAILED"
                overall_passed = False
                error_msg = str(exc) or type(exc).__name__
                logger.error(f"Step '{step.step_id}' failed: {error_msg}")

            step_duration = (time.perf_counter() - step_start) * 1000.0
            step_results.append(
                StepResult(
                    step_id=step.step_id,
                    action=step.action.value,
                    description=step.description or f"Execute {step.action.value}",
                    status="PASSED" if step_status == "PASSED" else "FAILED",
                    duration_ms=round(step_duration, 2),
                    details=details,
                    error=error_msg,
                )
            )

            if step_status == "FAILED" and not step.continue_on_error:
                # Mark remaining steps as SKIPPED
                curr_idx = workflow.steps.index(step)
                for remaining in workflow.steps[curr_idx + 1 :]:
                    step_results.append(
                        StepResult(
                            step_id=remaining.step_id,
                            action=remaining.action.value,
                            description=remaining.description,
                            status="SKIPPED",
                            duration_ms=0.0,
                            details={},
                            error="Skipped due to previous step failure",
                        )
                    )
                break

        total_duration = (time.perf_counter() - start_time) * 1000.0
        passed_count = sum(1 for s in step_results if s.status == "PASSED")
        failed_count = sum(1 for s in step_results if s.status == "FAILED")

        summary = (
            f"Test Workflow '{workflow.name}' completed in {total_duration:.1f}ms. "
            f"Passed: {passed_count}/{len(workflow.steps)}, Failed: {failed_count}."
        )

        return TestWorkflowResult(
            workflow_id=workflow.workflow_id,
            name=workflow.name,
            status="PASSED" if overall_passed else "FAILED",
            total_steps=len(workflow.steps),
            passed_steps=passed_count,
            failed_steps=failed_count,
            duration_ms=round(total_duration, 2),
            step_results=step_results,
            timestamp=datetime.now(timezone.utc).isoformat(),
            report_summary=summary,
        )

    async def _execute_step(self, step: TestStep, base_url: str) -> dict[str, Any]:
        """Translates a TestStep into specific Playwright MCP tool invocations and assertions."""
        params = step.params or {}

        if step.action == TestStepAction.NAVIGATE:
            url = params.get("url", "")
            if base_url and not url.startswith("http://") and not url.startswith("https://"):
                url = f"{base_url.rstrip('/')}/{url.lstrip('/')}"
            res = await self.call_tool("browser_navigate", {"url": url})
            return {"url": url, "result": res}

        elif step.action == TestStepAction.ASSERT_TITLE:
            expected = params.get("expected_title", "")
            eval_res = await self.call_tool(
                "browser_evaluate", {"function": "() => document.title"}
            )
            raw_text = self._extract_text_content(eval_res)
            if expected.lower() not in raw_text.lower():
                raise AssertionError(f"Expected title to contain '{expected}', but got: '{raw_text}'")
            return {"title": raw_text, "expected": expected, "match": True}

        elif step.action == TestStepAction.ASSERT_TEXT:
            expected_text = params.get("expected_text", "")
            selector = params.get("selector", "")
            js_fn = (
                f"() => {{ const el = document.querySelector('{selector}'); return el ? el.innerText : ''; }}"
                if selector
                else "() => document.body.innerText"
            )
            eval_res = await self.call_tool("browser_evaluate", {"function": js_fn})
            body_text = self._extract_text_content(eval_res)
            if expected_text.lower() not in body_text.lower():
                raise AssertionError(
                    f"Page text assertion failed: '{expected_text}' not found in target element or page body"
                )
            return {"matched_text": expected_text, "selector": selector or "body"}

        elif step.action == TestStepAction.ASSERT_VISIBLE:
            selector = params.get("selector", "")
            if not selector:
                raise ValueError("assert_visible requires 'selector' parameter")
            js_fn = f"() => {{ const el = document.querySelector('{selector}'); return !!(el && el.offsetParent !== null); }}"
            eval_res = await self.call_tool("browser_evaluate", {"function": js_fn})
            res_text = self._extract_text_content(eval_res)
            if "true" not in res_text.lower():
                raise AssertionError(f"Element '{selector}' is not visible on page")
            return {"selector": selector, "visible": True}

        elif step.action == TestStepAction.CLICK:
            selector = params.get("selector", "")
            text = params.get("text", "")
            if selector:
                js_click = f"() => {{ const el = document.querySelector('{selector}'); if (el) {{ el.click(); return true; }} return false; }}"
                eval_res = await self.call_tool("browser_evaluate", {"function": js_click})
                return {"clicked_selector": selector, "output": eval_res}
            elif text:
                res = await self.call_tool("browser_click", {"element": text})
                return {"clicked_text": text, "output": res}
            else:
                raise ValueError("Click action requires either 'selector' or 'text' parameter")

        elif step.action == TestStepAction.TYPE:
            selector = params.get("selector", "")
            text = params.get("text", "")
            if selector:
                js_type = f"() => {{ const el = document.querySelector('{selector}'); if (el) {{ el.value = '{text}'; el.dispatchEvent(new Event('input', {{ bubbles: true }})); return true; }} return false; }}"
                eval_res = await self.call_tool("browser_evaluate", {"function": js_type})
                return {"selector": selector, "typed_text": text, "output": eval_res}
            else:
                res = await self.call_tool("browser_type", {"text": text})
                return {"typed_text": text, "output": res}

        elif step.action == TestStepAction.PRESS_KEY:
            key = params.get("key", "Enter")
            res = await self.call_tool("browser_press_key", {"key": key})
            return {"pressed_key": key, "output": res}

        elif step.action == TestStepAction.WAIT_FOR:
            selector = params.get("selector", "")
            timeout_ms = params.get("timeout_ms", 5000)
            if selector:
                js_wait = f"() => {{ return !!document.querySelector('{selector}'); }}"
                eval_res = await self.call_tool("browser_evaluate", {"function": js_wait})
                return {"waited_for": selector, "output": eval_res}
            else:
                time.sleep(timeout_ms / 1000.0)
                return {"waited_ms": timeout_ms}

        elif step.action == TestStepAction.EVALUATE:
            script = params.get("script", "() => true")
            res = await self.call_tool("browser_evaluate", {"function": script})
            return {"evaluation": res}

        elif step.action == TestStepAction.SNAPSHOT:
            res = await self.call_tool("browser_snapshot", {})
            return {"snapshot": res}

        elif step.action == TestStepAction.TAKE_SCREENSHOT:
            res = await self.call_tool("browser_take_screenshot", {})
            return {"screenshot": res}

        else:
            raise NotImplementedError(f"Action '{step.action}' is not supported yet")

    @staticmethod
    def _extract_text_content(tool_result: dict[str, Any]) -> str:
        """Helper to extract text from Playwright MCP content payload."""
        content_items = tool_result.get("content", [])
        collected = []
        for item in content_items:
            if isinstance(item, dict) and "text" in item:
                collected.append(item["text"])
        return "\n".join(collected) if collected else str(tool_result)
