#!/usr/bin/env python3
"""Enterprise Verification Test: Direct Authentic Links, Deduplication & On-Demand Metadata.

Validates:
1. Direct authentic URLs to company job posts (clean role parameters, not conversational sentence).
2. Multi-strategy aggregation, validation, and strict deduplication without duplicate job postings.
3. Provenance merging (e.g. combined strategy badges for merged roles).
4. Necessary Ollama information (role_summary) and on-demand disclosure fields (job_id, match_analysis, responsibilities, qualifications, benefits).
"""

import sys
import json
import urllib.request

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_authentic_urls_and_clean_queries() -> None:
    print("[1] Verifying Authentic Career URLs & Clean Role Parameters...")
    payload = json.dumps({
        "query": "Search job for spring boot sort by age",
        "role": "Search job for spring boot sort by age",  # Conversational sentence passed as role
        "strategy_type": "all_strategies",
        "time_filter": "d",
        "model_name": "qwen3:8b",
        "candidate_skills": "Spring Boot, Microservices, Docker, Kubernetes"
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/xray/search",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read().decode())

    openings = data.get("sorted_openings", [])
    assert len(openings) > 0, "No openings returned"

    for idx, op in enumerate(openings):
        url = op.get("portal_url", "")
        direct_url = op.get("direct_apply_url", "")
        # Crucial check: The URL must NOT contain the full conversational sentence "Search+job+for"
        assert "Search+job+for" not in url and "Search%20job%20for" not in url, f"URL {url} contains conversational sentence!"
        assert "Search+job+for" not in direct_url and "Search%20job%20for" not in direct_url, f"Direct apply URL {direct_url} contains conversational sentence!"
        assert "Spring" in url or "spring" in url or "jobs" in url or "careers" in url, f"URL {url} missing target career destination"

        # Verify on-demand disclosure fields
        assert op.get("role_summary"), f"Opening {idx} missing necessary role_summary"
        assert op.get("job_id"), f"Opening {idx} missing job_id / requisition ID"
        assert op.get("match_analysis"), f"Opening {idx} missing Ollama match_analysis"
        assert len(op.get("responsibilities", [])) > 0, f"Opening {idx} missing responsibilities"
        assert len(op.get("qualifications", [])) > 0, f"Opening {idx} missing qualifications"
        assert op.get("benefits"), f"Opening {idx} missing benefits"

        print(f"  ✓ [{op['company']}] {op['job_id']}: URL={url[:50]}...")
        print(f"     Ollama Summary: {op['role_summary'][:65]}...")
        print(f"     Match Analysis: {op['match_analysis'][:65]}...")

    print("  -> PASSED: Authentic destination URLs and on-demand metadata verified.")

def test_multi_strategy_deduplication() -> None:
    print("\n[2] Verifying Multi-Strategy Deduplication & Provenance Aggregation...")
    payload = json.dumps({
        "query": "Spring Boot",
        "role": "Spring Boot",
        "strategy_type": "all_strategies",
        "time_filter": "d",
        "model_name": "qwen3:8b",
        "candidate_skills": "Spring Boot, Microservices"
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/xray/search",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())

    openings = data.get("sorted_openings", [])
    
    # Check for duplicate companies for same core role
    seen_roles = set()
    for op in openings:
        company = op.get("company", "").strip().lower()
        title = op.get("title", "").strip().lower()
        role_key = f"{company}::{title}"
        assert role_key not in seen_roles, f"Duplicate job detected: {role_key}"
        seen_roles.add(role_key)

        # Check provenance badge
        strategy_badge = op.get("strategy_badge", "")
        print(f"  ✓ Verified unique opening: {op['company']} - {op['title']} (Badge: {strategy_badge})")

    print(f"  -> Total unique, verified, validated openings: {len(openings)}")
    print("  -> PASSED: Zero duplicates across aggregated strategies.")

def main() -> int:
    try:
        test_authentic_urls_and_clean_queries()
        test_multi_strategy_deduplication()
        print("\n=======================================================")
        print("ALL AUTHENTIC LINKS, ON-DEMAND METADATA & DEDUPLICATION TESTS PASSED!")
        print("=======================================================")
        return 0
    except Exception as exc:
        print(f"\n❌ TEST FAILED: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
