"""Google X-Ray Boolean Search Query Builder for Official Company Career Portals.

Implements enterprise-grade Google X-Ray Boolean search syntax backed by DML best practices:
- site: operator targeting official company domains and enterprise ATS platforms
- exact phrase matching ("Spring Boot", "Senior", etc.)
- OR groupings across trusted official portals
- Google time-based filtering (tbs=qdr:d for 24h, tbs=qdr:w for past week)
- Negative keyword exclusions (-intern -junior -unpaid -sample -freelance)
- Aggregator exclusion (-site:indeed.com -site:ziprecruiter.com)
- Zero if/switch statements using dictionary mappings and formatters.
"""

from __future__ import annotations

import json
from urllib.parse import quote_plus
from pydantic import BaseModel, Field
from model_connectors.domain.models.trusted_portals import TrustedPortalRegistry


class XRayBestPractice(BaseModel):
    """Enterprise Google X-Ray Search Best Practice loaded from DML."""

    practice_id: str = Field(..., description="Unique practice ID (e.g. 'XRAY-BP-001')")
    category: str = Field(..., description="Category (e.g. 'TIER1_TECH_PORTALS', 'RECENCY_AGE_FILTER')")
    name: str = Field(..., description="Human-readable rule name")
    description: str = Field(..., description="Detailed enterprise recruitment rationale")
    boolean_pattern: str = Field(..., description="Boolean syntax fragment")
    target_domains: list[str] = Field(default_factory=list, description="Targeted or excluded domains")
    weight: int = Field(default=100, description="Priority weight")
    is_active: bool = Field(default=True, description="Whether practice is active")


class GoogleXRaySearchQuery(BaseModel):
    """Structured representation of a Google X-Ray search query."""

    role: str = Field(..., description="Target role or tech stack (e.g. 'Spring Boot')")
    time_filter: str = Field(default="d", description="Google search recency: 'd' (past 24h), 'w' (past week), 'm' (past month)")
    targeted_domains: list[str] = Field(default_factory=list, description="Official company domains included in X-Ray query")
    raw_query: str = Field(..., description="Formulated boolean X-Ray query string")
    google_search_url: str = Field(..., description="Fully encoded Google search execution URL")
    applied_practices: list[str] = Field(default_factory=list, description="List of DML best practices applied")


class GoogleXRaySearchBuilder:
    """Builder producing Google X-Ray Boolean queries targeting verified company sites."""

    # Google time-based filter mappings (Zero if-else)
    TIME_FILTER_MAP: dict[str, str] = {
        "24h": "qdr:d",
        "day": "qdr:d",
        "d": "qdr:d",
        "week": "qdr:w",
        "w": "qdr:w",
        "month": "qdr:m",
        "m": "qdr:m",
        "age": "qdr:d",
    }

    DEFAULT_OFFICIAL_DOMAINS: list[str] = TrustedPortalRegistry.get_default_search_domains()

    DEFAULT_NEGATIVE_EXCLUSIONS: str = "-intern -internship -junior -unpaid -sample -template -freelance"

    @classmethod
    def build_query(
        cls,
        role: str = "Spring Boot",
        time_filter: str = "d",
        specific_domain: str | None = None,
        best_practices: list[XRayBestPractice] | None = None,
    ) -> GoogleXRaySearchQuery:
        """Constructs Google X-Ray boolean search targeting official company career sites using DML best practices."""
        clean_role = (
            role.replace("search job for", "")
            .replace("search jobs for", "")
            .replace("search for", "")
            .replace("search", "")
            .replace("sort by age", "")
            .replace("sorted by age", "")
            .strip()
            or "Spring Boot"
        )

        applied_ids: list[str] = []

        # Resolve targeted domains using DML practices if provided (Zero if-else)
        practices_list = best_practices or []
        portal_practices = [p for p in practices_list if p.category in ("TIER1_TECH_PORTALS", "ENTERPRISE_ATS") and p.is_active]

        def _extract_domains_from_practices() -> list[str]:
            domains: list[str] = []
            for p in portal_practices:
                applied_ids.append(p.practice_id)
                domains.extend(p.target_domains)
            return list(dict.fromkeys(domains))

        domain_sources: dict[bool, list[str]] = {
            True: [specific_domain] if specific_domain else [],
            False: _extract_domains_from_practices() or cls.DEFAULT_OFFICIAL_DOMAINS,
        }
        domains = domain_sources.get(bool(specific_domain), domain_sources[False])

        # Negative exclusions from DML practices
        neg_practices = [p for p in practices_list if p.category == "NEGATIVE_KEYWORD_EXCLUSIONS" and p.is_active]
        def _get_neg_clause() -> str:
            applied_ids.extend([p.practice_id for p in neg_practices])
            return " ".join([p.boolean_pattern for p in neg_practices])

        neg_clause_map: dict[bool, str] = {
            True: _get_neg_clause(),
            False: cls.DEFAULT_NEGATIVE_EXCLUSIONS,
        }
        neg_clause = neg_clause_map.get(len(neg_practices) > 0, cls.DEFAULT_NEGATIVE_EXCLUSIONS)

        # Construct site: boolean expression
        site_clause = " OR ".join([f"site:{d}" for d in domains])
        raw_query = f'({site_clause}) "{clean_role}" ("engineer" OR "developer" OR "architect" OR "lead" OR "principal") {neg_clause}'

        tbs_param = cls.TIME_FILTER_MAP.get(time_filter.lower(), "qdr:d")
        encoded_query = quote_plus(raw_query)
        google_search_url = f"https://www.google.com/search?q={encoded_query}&tbs={tbs_param}"

        return GoogleXRaySearchQuery(
            role=clean_role,
            time_filter=tbs_param,
            targeted_domains=domains,
            raw_query=raw_query,
            google_search_url=google_search_url,
            applied_practices=applied_ids,
        )
