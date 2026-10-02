"""Live HTTP end-to-end integration test against the running service."""

import asyncio
import httpx


async def run_live_test() -> None:
    base_url = "http://127.0.0.1:8000"
    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        # 1. Check health
        health_resp = await client.get("/health")
        print("Health status:", health_resp.json())
        assert health_resp.status_code == 200

        # 2. Create Session
        session_payload = {
            "user_id": "engineer-lead",
            "cookie_id": "cookie-sess-live-999",
            "metadata": {"source": "integration_test"},
        }
        sess_resp = await client.post("/api/v1/sessions", json=session_payload)
        print("Session created:", sess_resp.json())
        assert sess_resp.status_code == 201
        session_id = sess_resp.json()["session_id"]

        # 3. Query Token Metrics initially
        token_resp = await client.get("/api/v1/tokens/ollama-docker")
        print("Initial token metrics:", token_resp.json())

        # 4. Execute Inference via Ollama Connector (with LangGraph orchestration)
        inf_payload = {
            "session_id": session_id,
            "prompt": "Respond with the word SUCCESS.",
            "connection_id": "ollama-docker",
            "user_id": "engineer-lead",
            "cookie_id": "cookie-sess-live-999",
            "model_name": "tinyllama:latest",
        }
        print("Executing inference through LangGraph workflow...")
        inf_resp = await client.post("/api/v1/inference", json=inf_payload)
        inf_data = inf_resp.json()
        print("Inference Response Content:", repr(inf_data.get("content", "").strip()))
        print("Token Status:", inf_data.get("token_status"))
        assert inf_resp.status_code == 200

        # 5. Check Messages History
        msgs_resp = await client.get(f"/api/v1/sessions/{session_id}/messages")
        msgs = msgs_resp.json()
        print(f"Stored Messages Count for Session ({session_id}):", len(msgs))
        assert len(msgs) >= 2

        # 6. Trigger Conversation Compaction
        compact_resp = await client.post(f"/api/v1/sessions/{session_id}/compact")
        print("Compacted conversation:", compact_resp.json())

        print("\nAll live HTTP integration tests PASSED!")


if __name__ == "__main__":
    asyncio.run(run_live_test())
