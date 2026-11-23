-- =============================================================================
-- Enterprise Trusted Portals & Official Response Schemas (DML)
-- Eliminates static values in codebase by loading verified registry from DML
-- =============================================================================

-- 1. Official Trusted Company Career Portals & ATS Platforms
INSERT OR REPLACE INTO trusted_company_portals (
    portal_id, company_name, official_domain, portal_url, portal_type,
    logo_url, logo_format, verification_source, search_url_template,
    supported_schemas_json, is_active
) VALUES
(
    'google',
    'Google',
    'careers.google.com',
    'https://careers.google.com/jobs/results',
    'company_official',
    'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg',
    'svg',
    'Official Vector CDN / Google Brand Guidelines',
    'https://careers.google.com/jobs/results?q={role}&sort=date',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'microsoft',
    'Microsoft',
    'careers.microsoft.com',
    'https://careers.microsoft.com/professionals/us/en',
    'company_official',
    'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
    'svg',
    'Official Vector CDN / Microsoft Trademark Center',
    'https://careers.microsoft.com/professionals/us/en?role={role}&sort=recent',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'apple',
    'Apple',
    'jobs.apple.com',
    'https://jobs.apple.com/en-us/search',
    'company_official',
    'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg',
    'svg',
    'Official Vector CDN / Apple Identity Guidelines',
    'https://jobs.apple.com/en-us/search?search={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'amazon',
    'Amazon AWS',
    'amazon.jobs',
    'https://www.amazon.jobs/en/search',
    'company_official',
    'https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg',
    'svg',
    'Official Vector CDN / Amazon AWS Media Assets',
    'https://www.amazon.jobs/en/search?base_query={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'netflix',
    'Netflix',
    'jobs.netflix.com',
    'https://jobs.netflix.com/search',
    'company_official',
    'https://upload.wikimedia.org/wikipedia/commons/0/0c/Netflix_2015_N_logo.svg',
    'svg',
    'Official Vector CDN / Netflix Brand Assets',
    'https://jobs.netflix.com/search?q={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'meta',
    'Meta',
    'metacareers.com',
    'https://www.metacareers.com/jobs',
    'company_official',
    'https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg',
    'svg',
    'Official Vector CDN / Meta Brand Resource Center',
    'https://www.metacareers.com/jobs?q={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'stripe',
    'Stripe',
    'stripe.com',
    'https://stripe.com/jobs',
    'company_official',
    'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
    'svg',
    'Official Vector CDN / Stripe Press Kit',
    'https://stripe.com/jobs/search?q={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'salesforce',
    'Salesforce',
    'salesforce.com',
    'https://salesforce.com/careers',
    'company_official',
    'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
    'svg',
    'Official Vector CDN / Salesforce Brand Central',
    'https://salesforce.com/careers/jobs?q={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'greenhouse',
    'Greenhouse ATS',
    'boards.greenhouse.io',
    'https://boards.greenhouse.io',
    'enterprise_ats',
    'https://www.google.com/s2/favicons?domain=greenhouse.io&sz=128',
    'png_hires',
    'Official Google Favicon High-Res Resolver',
    'https://boards.greenhouse.io/search?query={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'lever',
    'Lever ATS',
    'jobs.lever.co',
    'https://jobs.lever.co',
    'enterprise_ats',
    'https://www.google.com/s2/favicons?domain=lever.co&sz=128',
    'png_hires',
    'Official Google Favicon High-Res Resolver',
    'https://jobs.lever.co/search?query={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'workday',
    'Workday ATS',
    'myworkdayjobs.com',
    'https://myworkdayjobs.com',
    'enterprise_ats',
    'https://upload.wikimedia.org/wikipedia/commons/d/df/Workday_logo.svg',
    'svg',
    'Official Vector CDN / Workday Brand Assets',
    'https://myworkdayjobs.com/search?q={role}',
    '["https://schema.org/JobPosting"]',
    1
),
(
    'linkedin',
    'LinkedIn',
    'linkedin.com',
    'https://www.linkedin.com/jobs',
    'professional_network',
    'https://upload.wikimedia.org/wikipedia/commons/8/81/LinkedIn_icon.svg',
    'svg',
    'Official Vector CDN / LinkedIn Brand Center',
    'https://www.linkedin.com/jobs/search/?keywords={role}&sortBy=DD',
    '["https://schema.org/JobPosting"]',
    1
);

-- 2. Official Standard Response Schemas
INSERT OR REPLACE INTO official_response_schemas (
    schema_id, schema_name, specification_url, target_site_or_standard,
    json_schema_definition, sample_template_json, is_active
) VALUES
(
    'schema_org_job_posting',
    'Schema.org Official JobPosting Specification',
    'https://schema.org/JobPosting',
    'Schema.org / Google Search Central Official Structured Data Standard',
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "JobPosting",
        "type": "object",
        "required": ["@context", "@type", "title", "description", "datePosted", "hiringOrganization", "jobLocation", "url"],
        "properties": {
            "@context": {"type": "string", "enum": ["https://schema.org", "http://schema.org"]},
            "@type": {"type": "string", "enum": ["JobPosting"]},
            "title": {"type": "string", "description": "Official job title"},
            "description": {"type": "string", "description": "Full job description HTML or text"},
            "datePosted": {"type": "string", "format": "date-time", "description": "ISO 8601 posting date"},
            "validThrough": {"type": "string", "format": "date-time"},
            "employmentType": {"type": "string", "enum": ["FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY", "INTERN"]},
            "hiringOrganization": {
                "type": "object",
                "required": ["@type", "name", "sameAs", "logo"],
                "properties": {
                    "@type": {"type": "string", "enum": ["Organization"]},
                    "name": {"type": "string"},
                    "sameAs": {"type": "string", "format": "uri"},
                    "logo": {"type": "string", "format": "uri"}
                }
            },
            "jobLocation": {
                "type": "object",
                "required": ["@type", "address"],
                "properties": {
                    "@type": {"type": "string", "enum": ["Place"]},
                    "address": {
                        "type": "object",
                        "properties": {
                            "@type": {"type": "string", "enum": ["PostalAddress"]},
                            "addressLocality": {"type": "string"},
                            "addressRegion": {"type": "string"},
                            "addressCountry": {"type": "string"}
                        }
                    }
                }
            },
            "baseSalary": {
                "type": "object",
                "properties": {
                    "@type": {"type": "string", "enum": ["MonetaryAmount"]},
                    "currency": {"type": "string", "default": "USD"},
                    "value": {
                        "type": "object",
                        "properties": {
                            "@type": {"type": "string", "enum": ["QuantitativeValue"]},
                            "minValue": {"type": "number"},
                            "maxValue": {"type": "number"},
                            "unitText": {"type": "string", "enum": ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"]}
                        }
                    }
                }
            },
            "directApply": {"type": "boolean", "default": true},
            "url": {"type": "string", "format": "uri"}
        }
    }',
    '{
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Senior Cloud Platform Engineer",
        "description": "Architect and deploy distributed enterprise microservices.",
        "datePosted": "2026-10-03T08:00:00Z",
        "employmentType": "FULL_TIME",
        "hiringOrganization": {
            "@type": "Organization",
            "name": "Google",
            "sameAs": "https://careers.google.com",
            "logo": "https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
        },
        "jobLocation": {
            "@type": "Place",
            "address": {
                "@type": "PostalAddress",
                "addressLocality": "Mountain View",
                "addressRegion": "CA",
                "addressCountry": "US"
            }
        },
        "baseSalary": {
            "@type": "MonetaryAmount",
            "currency": "USD",
            "value": {
                "@type": "QuantitativeValue",
                "minValue": 175000,
                "maxValue": 225000,
                "unitText": "YEAR"
            }
        },
        "directApply": true,
        "url": "https://careers.google.com/jobs/results"
    }',
    1
),
(
    'playwright_mcp_workflow_v1',
    'Playwright MCP Browser Automation Workflow Schema',
    'https://modelbox.io/spec/playwright-mcp/v1',
    'Playwright Model Context Protocol Specification',
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "PlaywrightMCPWorkflow",
        "type": "object",
        "required": ["workflow_id", "name", "description", "base_url", "steps"],
        "properties": {
            "workflow_id": {"type": "string"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "base_url": {"type": "string", "format": "uri"},
            "timeout_ms": {"type": "integer", "default": 45000},
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["action"],
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["navigate", "click", "type", "select_option", "wait_for_selector", "take_screenshot", "extract_content", "evaluate"]
                        },
                        "selector": {"type": "string"},
                        "url": {"type": "string"},
                        "value": {"type": "string"},
                        "timeout_ms": {"type": "integer"},
                        "description": {"type": "string"}
                    }
                }
            },
            "metadata": {"type": "object"}
        }
    }',
    '{
        "workflow_id": "wf-job-hunt-official-1",
        "name": "Official Career Site Search Automation",
        "description": "Navigates to verified official company career portal and filters by recency",
        "base_url": "https://careers.google.com/jobs/results",
        "timeout_ms": 45000,
        "steps": [
            {"action": "navigate", "url": "https://careers.google.com/jobs/results?q=Spring+Boot&sort=date", "description": "Navigate to Google Careers sorted by recency"},
            {"action": "wait_for_selector", "selector": "[role=\"listitem\"]", "timeout_ms": 10000, "description": "Wait for job search listings to render"},
            {"action": "take_screenshot", "description": "Capture verified job search results evidence"}
        ],
        "metadata": {
            "official_portal": "careers.google.com",
            "image_verification": "job_search_results.png"
        }
    }',
    1
);
