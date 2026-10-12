-- =============================================================================
-- Enterprise Google X-Ray Search Best Practices Data (DML)
-- Adheres to strict enterprise recruitment, ATS compliance, and Boolean syntax standards
-- =============================================================================

INSERT OR REPLACE INTO xray_best_practices (
    practice_id, category, name, description, boolean_pattern, target_domains, weight, is_active
) VALUES 
(
    'XRAY-BP-001',
    'TIER1_TECH_PORTALS',
    'Tier-1 Direct Career Portal Operator Clustering',
    'Target verified official career subdomains of Tier-1 technology enterprises to bypass aggregator clutter and SEO spam.',
    '(site:careers.google.com OR site:careers.microsoft.com OR site:jobs.apple.com OR site:amazon.jobs OR site:jobs.netflix.com OR site:metacareers.com)',
    '["careers.google.com", "careers.microsoft.com", "jobs.apple.com", "amazon.jobs", "jobs.netflix.com", "metacareers.com"]',
    100,
    1
),
(
    'XRAY-BP-002',
    'ENTERPRISE_ATS',
    'Enterprise Cloud ATS Platform Clustering',
    'X-Ray official enterprise applicant tracking systems where corporate jobs are published directly before syndication.',
    '(site:boards.greenhouse.io OR site:jobs.lever.co OR site:myworkdayjobs.com OR site:jobs.smartrecruiters.com OR site:jobs.ashbyhq.com)',
    '["boards.greenhouse.io", "jobs.lever.co", "myworkdayjobs.com", "jobs.smartrecruiters.com", "jobs.ashbyhq.com"]',
    95,
    1
),
(
    'XRAY-BP-003',
    'RECENCY_AGE_FILTER',
    'Google Recency Parameter (Past 24 Hours)',
    'Apply Google strict time-based parameter tbs=qdr:d to isolate fresh openings posted within the last 24 hours, ensuring first-mover candidate advantage.',
    '&tbs=qdr:d',
    '[]',
    90,
    1
),
(
    'XRAY-BP-004',
    'RECENCY_AGE_FILTER',
    'Google Recency Parameter (Past 7 Days)',
    'Apply Google time-based parameter tbs=qdr:w to capture recent openings from the past week.',
    '&tbs=qdr:w',
    '[]',
    85,
    1
),
(
    'XRAY-BP-005',
    'NEGATIVE_KEYWORD_EXCLUSIONS',
    'Enterprise Negative Keyword Exclusion Filters',
    'Negative keyword syntax to filter out junior roles, unpaid internships, recruiter agency templates, and sample postings.',
    '-intern -internship -junior -"entry level" -unpaid -sample -template -freelance',
    '[]',
    80,
    1
),
(
    'XRAY-BP-006',
    'EXACT_ROLE_GROUPING',
    'Senior & Architect Title Synonym Grouping',
    'Boolean OR clustering of engineering seniority levels and role designators for precise matching.',
    '("senior" OR "lead" OR "principal" OR "staff" OR "architect") ("software engineer" OR "backend engineer" OR "systems developer")',
    '[]',
    85,
    1
),
(
    'XRAY-BP-007',
    'TECH_STACK_CLUSTERING',
    'Spring Boot Enterprise Tech Stack Cluster',
    'Clustered exact keywords for Spring Boot enterprise microservices ecosystem.',
    '"Spring Boot" ("microservices" OR "distributed systems") ("Docker" OR "Kubernetes") ("Kafka" OR "RabbitMQ" OR "event-driven")',
    '[]',
    90,
    1
),
(
    'XRAY-BP-008',
    'SECURITY_ATS_COMPLIANCE',
    'Aggregator and Scraping Domain Exclusion',
    'Excludes job scrapers, resume farms, and SEO redirectors to ensure candidates only view and apply via verified corporate domains.',
    '-site:indeed.com -site:ziprecruiter.com -site:monster.com -site:careerbuilder.com',
    '["indeed.com", "ziprecruiter.com", "monster.com", "careerbuilder.com"]',
    75,
    1
);
