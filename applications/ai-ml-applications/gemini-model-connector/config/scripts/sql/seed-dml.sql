-- ModelBox Connector DML Seed Script
-- Location: scripts/sql/seed-dml.sql
-- Seed script for initial state (Capitalized Tables & Columns)

INSERT OR IGNORE INTO MODEL_AUTH (
  ID,
  MODEL,
  AUTH_TYPE,
  ACCOUNT_EMAIL,
  ACCOUNT_NAME,
  ACCESS_TOKEN,
  STATUS,
  METADATA
) VALUES (
  'init-default',
  'default',
  'api-key',
  'system@modelbox.local',
  'ModelBox System',
  '',
  'UNAUTHENTICATED',
  '{"system_seeded":true}'
);

INSERT OR IGNORE INTO JOB_SEARCH_PROMPTS (
  ID,
  PROMPT_KEY,
  PROMPT_TYPE,
  CONTENT,
  DESCRIPTION
) VALUES (
  'prompt-job-sys-inst',
  'JOB_SEARCH_SYSTEM_INSTRUCTION',
  'SYSTEM_INSTRUCTION',
  'You are an expert AI Career Strategist and Job Match Analyst. Analyze job requirements rigorously against the candidate inline resume, produce precise skill gap evaluations, and generate tailored markdown documents.',
  'Default system instruction for AI Career Strategist session initialization'
);

INSERT OR IGNORE INTO JOB_SEARCH_PROMPTS (
  ID,
  PROMPT_KEY,
  PROMPT_TYPE,
  CONTENT,
  DESCRIPTION
) VALUES (
  'prompt-job-usr-msg',
  'JOB_SEARCH_USER_MESSAGE',
  'USER_PROMPT',
  'Analyze the provided job description and candidate resume.
1. Perform deep requirement extraction.
2. Score and inline-match candidate resume against requirements.
3. Generate a tailored Markdown resume and application pitch.
Provide your output as a JSON block with keys ''job_analysis'', ''resume_match'', and ''tailored_markdown''.',
  'Default user turn recording prompt for job search context'
);

INSERT OR IGNORE INTO JOB_SEARCH_PROMPTS (
  ID,
  PROMPT_KEY,
  PROMPT_TYPE,
  CONTENT,
  DESCRIPTION
) VALUES (
  'prompt-job-analysis-tpl',
  'JOB_SEARCH_ANALYSIS_PROMPT',
  'ANALYSIS_TEMPLATE',
  'You are an elite AI Career & Job Application Agent.
Carefully examine the Job Posting and Candidate Resume below.

==================================================
CANDIDATE RESUME:
{{resume}}
==================================================
JOB POSTING SPECIFICATION:
{{jobContent}}
==================================================

TASK INSTRUCTIONS:
1. Extract Job Details: title, company name, location, required skills, preferred skills, key responsibilities, experience level.
2. Evaluate Resume Match: Calculate match score (0-100), matched skills list, missing/gap skills, concise summary evaluation, 3-5 tailored bullet points.
3. Generate complete Tailored Resume Markdown document and Application Cover Letter.

Format your entire response strictly as a JSON object:
{
  "job_analysis": {
    "job_title": "string",
    "company_name": "string",
    "location": "string",
    "required_skills": ["string"],
    "preferred_skills": ["string"],
    "key_responsibilities": ["string"],
    "experience_level": "string"
  },
  "resume_match": {
    "match_score_percentage": 88.5,
    "matched_skills": ["string"],
    "missing_skills": ["string"],
    "summary_evaluation": "string",
    "tailored_highlights": ["string"],
    "recommended_modifications": [
      { "section": "string", "recommendation": "string" }
    ]
  },
  "tailored_markdown": "Complete Markdown document of the candidate''s tailored resume...",
  "cover_letter_markdown": "Complete Markdown document for job application cover letter..."
}',
  'Default analysis prompt template for job matching and markdown generation'
);

INSERT OR IGNORE INTO JOB_SEARCH_PROMPTS (
  ID,
  PROMPT_KEY,
  PROMPT_TYPE,
  CONTENT,
  DESCRIPTION
) VALUES (
  'prompt-job-cli-sys',
  'JOB_SEARCH_CLI_SYSTEM_INSTRUCTION',
  'CLI_SYSTEM_INSTRUCTION',
  'Output valid JSON only with keys job_analysis, resume_match, tailored_markdown, cover_letter_markdown.',
  'CLI system instruction enforcing JSON schema formatting'
);

