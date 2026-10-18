"""Integration verification script for Gemini Model Connector.

Tests:
1. GET /api/v1/health
2. POST /api/v1/conversations
3. POST /api/v1/conversations/:id/context
4. POST /api/v1/conversations/:id/messages (Gemini CLI communication)
5. GET /api/v1/conversations/:id (History and contexts)
6. POST /api/v1/job-search/analyze (HTML/Text/URL to Markdown artifact generation + inline resume matching)
7. GET /api/v1/job-search/artifacts/:filename (Download generated Markdown)
8. GET /api/v1/audit/logs (Audit logging validation)
9. POST /api/v1/auth/login and GET /api/v1/auth/status
10. POST /api/v1/auth/logout (Single model logout)
11. POST /api/v1/auth/logout (Global logout for all models)
"""

import os
import time
import sys
import httpx

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8090")

def run_tests():
    print(f"=== Testing Gemini Model Connector at {BASE_URL} ===")
    client = httpx.Client(base_url=BASE_URL, timeout=60.0)

    # 1. Health check
    print("\n[1/7] Testing GET /api/v1/health...")
    health_resp = client.get("/api/v1/health")
    assert health_resp.status_code == 200, f"Health check failed: {health_resp.text}"
    health_data = health_resp.json()
    print(f"  [OK] Health Status: {health_data['status']}")
    print(f"  [OK] CLI Status: {health_data['cli_status']}")
    print(f"  [OK] API Status: {health_data.get('api_status', {})}")

    # 2. Create conversation
    print("\n[2/7] Testing POST /api/v1/conversations...")
    conv_resp = client.post(
        "/api/v1/conversations",
        json={
            "title": "Systems Architect Conversation",
            "model": "gemini-3.5-flash",
            "system_instruction": "You are an elite systems architect.",
            "tags": ["test", "docker", "gemini-cli"],
            "initial_resume": "Jane Doe - Staff Architect with 8+ years distributed systems experience."
        }
    )
    assert conv_resp.status_code == 201, f"Create conversation failed: {conv_resp.text}"
    conv = conv_resp.json()
    conv_id = conv["id"]
    print(f"  [OK] Conversation created: ID={conv_id}, Title='{conv['title']}'")

    # 3. Attach Context
    print("\n[3/7] Testing POST /api/v1/conversations/:id/context...")
    ctx_resp = client.post(
        f"/api/v1/conversations/{conv_id}/context",
        json={
            "context_type": "reference_document",
            "title": "Architecture Standards",
            "content": "All services must run in Docker and maintain SQLite audit logs."
        }
    )
    assert ctx_resp.status_code == 201, f"Attach context failed: {ctx_resp.text}"
    print(f"  [OK] Context item attached successfully.")

    # 4. Send Message (Communicates with Gemini CLI or REST API)
    print("\n[4/7] Testing POST /api/v1/conversations/:id/messages (Gemini communication)...")
    msg_resp = client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        json={
            "content": "Describe how Google Gemini CLI handles headless non-interactive execution."
        }
    )
    assert msg_resp.status_code == 200, f"Send message failed: {msg_resp.text}"
    msg_data = msg_resp.json()
    asst_msg = msg_data["assistantMessage"]
    assert len(asst_msg["content"].strip()) > 0, "Assistant response must not be empty"
    print(f"  [OK] Model Response Received: '{asst_msg['content'][:120]}...'")
    print(f"  [OK] Latency: {asst_msg['latency_ms']}ms | Exit Code: {asst_msg.get('cli_exit_code', 0)}")

    # 5. Job Search & Resume Alignment Agent
    print("\n[5/7] Testing POST /api/v1/job-search/analyze (HTML & Inline Resume to Markdown)...")
    job_resp = client.post(
        "/api/v1/job-search/analyze",
        json={
            "target_role": "Senior AI Systems Engineer",
            "resume_content": (
                "Jane Doe\n"
                "Summary: 8+ years designing high-throughput Node.js microservices, Docker infrastructure, and LLM connectors.\n"
                "Skills: Node.js, TypeScript, Docker, SQLite, REST APIs, Google Gemini CLI, LangGraph.\n"
                "Experience: Led migration to containerized Gemini CLI services reducing API latency by 40%."
            ),
            "job_html": (
                "<div class='job-posting'>"
                "<h1>Senior AI Systems Engineer</h1>"
                "<p>Requirements: 5+ years with Node.js, Docker, Google Gemini CLI, and database audit logging.</p>"
                "</div>"
            ),
            "generate_markdown_files": True
        }
    )
    assert job_resp.status_code == 200, f"Job search analysis failed: {job_resp.text}"
    job_data = job_resp.json()
    print(f"  [OK] Extracted Job Title: {job_data['analysis']['job_title']}")
    print(f"  [OK] Match Score: {job_data['resume_match']['match_score_percentage']}%")
    print(f"  [OK] Matched Skills: {job_data['resume_match']['matched_skills']}")
    print(f"  [OK] Markdown Artifact Path: {job_data['markdown_filepath']}")

    # 6. Retrieve Generated Markdown Artifact
    print("\n[6/7] Testing GET /api/v1/job-search/artifacts/:filename...")
    artifact_path = job_data["markdown_filepath"]
    if artifact_path:
        filename = os.path.basename(artifact_path)
        art_resp = client.get(f"/api/v1/job-search/artifacts/{filename}")
        assert art_resp.status_code == 200, f"Get artifact failed: {art_resp.text}"
        assert len(art_resp.text) > 50, "Markdown artifact content too short"
        print(f"  [OK] Successfully downloaded artifact '{filename}' ({len(art_resp.text)} bytes)")

    # 7. Query SQLite Audit Logs
    print("\n[7/8] Testing GET /api/v1/audit/logs...")
    audit_resp = client.get("/api/v1/audit/logs?limit=10")
    assert audit_resp.status_code == 200, f"Query audit logs failed: {audit_resp.text}"
    audit_data = audit_resp.json()
    print(f"  [OK] Total Audit Logs Found: {audit_data['count']}")
    for log in audit_data['logs'][:3]:
        print(f"    - [{log['timestamp']}] Action: {log['action']} | Status: {log['status']} | Latency: {log.get('latency_ms')}ms")

    # 8. Test Direct Gemini API Execution Mode
    print("\n[8/8] Testing Gemini API Mode (POST /api/v1/conversations/:id/messages with mode='api')...")
    api_resp = client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        json={
            "content": "Verify that Gemini API direct integration is active.",
            "mode": "api"
        }
    )
    assert api_resp.status_code == 200, f"API mode execution failed: {api_resp.text}"
    api_data = api_resp.json()
    api_asst = api_data["assistantMessage"]
    assert len(api_asst["content"].strip()) > 0, "API mode response must not be empty"
    runner_type = api_asst.get("metadata", {}).get("runner_type", "unknown")
    print(f"  [OK] API Mode Turn Completed: Runner='{runner_type}' | Latency: {api_asst['latency_ms']}ms")

    # 9. Test Gemini Authentication Status and Login
    print("\n[9/11] Testing Gemini Authentication (GET /api/v1/auth/status & POST /api/v1/auth/login)...")
    auth_status_resp = client.get("/api/v1/auth/status")
    assert auth_status_resp.status_code == 200, f"Auth status failed: {auth_status_resp.text}"
    auth_status = auth_status_resp.json()
    print(f"  [OK] Auth status fetched. Global authed: {auth_status.get('global_authenticated')}")

    # Test login for a specific model
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "model": "gemini-3.5-flash",
            "api_key": "test_verification_key_flash",
            "account_email": "engineer@antigravity.dev"
        }
    )
    assert login_resp.status_code == 200, f"Model login failed: {login_resp.text}"
    print(f"  [OK] Model 'gemini-3.5-flash' authenticated: {login_resp.json().get('message')}")

    # Check status again to verify model is authenticated
    status_check = client.get("/api/v1/auth/status").json()
    assert status_check["models"]["gemini-3.5-flash"]["authenticated"] is True, "Model should now be authenticated"
    print(f"  [OK] Verified 'gemini-3.5-flash' is marked authenticated in SQLite")

    # Also test browser OAuth initiation URL generation
    oauth_init_resp = client.get("/api/v1/auth/login?model=gemini-1.5-pro")
    assert oauth_init_resp.status_code == 200, f"OAuth init failed: {oauth_init_resp.text}"
    init_data = oauth_init_resp.json()
    auth_url_val = init_data.get("auth_url") or init_data.get("oauth_url")
    assert auth_url_val is not None, "Response must include Google OAuth URL"
    print(f"  [OK] Google OAuth browser URL generated: {auth_url_val[:60]}...")

    # 10. Test Single Model Logout API Endpoint
    print("\n[10/11] Testing Specific Model Logout (POST /api/v1/auth/logout with model parameter)...")
    logout_single_resp = client.post(
        "/api/v1/auth/logout",
        json={"model": "gemini-3.5-flash"}
    )
    assert logout_single_resp.status_code == 200, f"Single model logout failed: {logout_single_resp.text}"
    print(f"  [OK] Single model logout response: {logout_single_resp.json().get('message')}")

    # Verify model is no longer authenticated
    post_logout_status = client.get("/api/v1/auth/status").json()
    assert post_logout_status["models"]["gemini-3.5-flash"]["authenticated"] is False, "Model should be unauthenticated after logout"
    print(f"  [OK] Verified 'gemini-3.5-flash' is unauthenticated after single logout")

    # 11. Test Global Logout (All Models) API Endpoint
    print("\n[11/11] Testing Global Logout for All Models (POST /api/v1/auth/logout with all=True)...")
    # First authenticate multiple models
    client.post("/api/v1/auth/login", json={"model": "gemini-3.5-flash", "api_key": "key1"})
    client.post("/api/v1/auth/login", json={"model": "gemini-1.5-pro", "api_key": "key2"})
    client.post("/api/v1/auth/login", json={"model": "default", "api_key": "global_key"})

    # Now execute global logout
    logout_all_resp = client.post("/api/v1/auth/logout", json={"all": True})
    assert logout_all_resp.status_code == 200, f"Logout all failed: {logout_all_resp.text}"
    print(f"  [OK] Global logout response: {logout_all_resp.json().get('message')}")

    # Verify all models are unauthenticated
    final_status = client.get("/api/v1/auth/status").json()
    assert final_status.get("global_authenticated") is False, "Global auth should be cleared"
    for m, info in final_status.get("models", {}).items():
        assert info["authenticated"] is False, f"Model {m} should be unauthenticated"
    print(f"  [OK] Verified all models successfully logged out")

    print("\n=======================================================")
    print("  ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! [OK]  ")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
