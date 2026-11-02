import test from "node:test";
import assert from "node:assert/strict";
import { ResumeAstService } from "@/services/job/ResumeAstService";
import { SkillCompilerService } from "@/services/apps/SkillCompilerService";
import { ComfyUiOrchestrator } from "@/services/story/ComfyUiOrchestrator";
import { RestrictionAuditService } from "@/services/audit/RestrictionAuditService";

test("ResumeAstService - parses resume markdown into structured AST and scorecard", () => {
  const resumeText = `
# Jane Doe
Email: jane.doe@enterprise.io
Phone: +1-555-0199

## Technical Skills
- TypeScript, Python, Node.js, React, Docker, Kubernetes, SQL

## Professional Experience
Senior Cloud Architect at Global Tech Inc (2020 - Present)
- Led microservices migration reducing latency by 40%.
- Engineered distributed event streaming pipeline.

Software Engineer at InnoSys (2017 - 2020)
- Implemented REST APIs and automated CI/CD pipelines.

## Education
B.S. in Computer Science, University of Technology (2017)
`;

  const ast = ResumeAstService.parseResumeText(resumeText);
  assert.equal(ast.candidateName, "Jane Doe");
  assert.equal(ast.email, "jane.doe@enterprise.io");
  assert.ok(ast.skills.map((s) => s.toLowerCase()).includes("typescript"));
  assert.ok(ast.skills.map((s) => s.toLowerCase()).includes("python"));
  assert.ok(ast.skills.map((s) => s.toLowerCase()).includes("docker"));
  assert.ok(ast.experienceYears >= 5);
  assert.ok(ast.education.length >= 1);

  const scorecard = ResumeAstService.generateScorecard(ast, "Senior Cloud Architect");
  assert.equal(scorecard.targetRole, "Senior Cloud Architect");
  assert.ok(scorecard.matchPercentage > 0);
  assert.ok(scorecard.keyStrengths.length > 0);
  assert.equal(typeof scorecard.qualifiedForAutofill, "boolean");
});

test("SkillCompilerService - compiles markdown instructions into executable skill manifest", () => {
  const skillMarkdown = `# Data Transformer Skill
> Description: Transforms structured datasets into analytics schemas

## Tools
- tool: parse_csv
- tool: validate_schema
- tool: export_parquet
`;

  const manifest = SkillCompilerService.compileSkillMarkdown(skillMarkdown);
  assert.equal(manifest.skillName, "Data Transformer Skill");
  assert.equal(manifest.toolsCount, 3);
  assert.ok(manifest.isValid);
  assert.ok(manifest.declaredTools.includes("parse_csv"));
  assert.ok(manifest.declaredTools.includes("validate_schema"));
  assert.ok(manifest.declaredTools.includes("export_parquet"));
});

test("ComfyUiOrchestrator - compiles text prompt into DAG execution workflow", () => {
  const dag = ComfyUiOrchestrator.generateWorkflowDag("A cinematic photorealistic sci-fi robot in neon rain", 4);
  assert.ok(dag.projectId.startsWith("STORY-"));
  assert.ok(dag.promptId.startsWith("PROMPT-"));
  assert.equal(dag.nodeCount, 4);
  assert.equal(dag.executionStatus, "QUEUED");
  assert.ok(dag.steps.some((s) => s.nodeType === "KSampler"));
  assert.ok(dag.steps.some((s) => s.nodeType === "VAEDecode"));
});

test("RestrictionAuditService - logs and queries policy audit trail", () => {
  const record = RestrictionAuditService.logRestriction(
    "TENANT",
    "tenant-aud-1",
    "COMPANY_POLICY",
    "Prompt violated explicit content filter",
    "corr-aud-100",
  );

  assert.ok(record.restrictionId.startsWith("RESTRICT-"));
  assert.equal(record.restrictionType, "COMPANY_POLICY");
  assert.equal(record.scope, "TENANT");
  assert.equal(record.triggeredByCorrelationId, "corr-aud-100");

  const queryResults = RestrictionAuditService.queryAuditTrail("TENANT", "tenant-aud-1");
  assert.ok(queryResults.length >= 1);
  assert.equal(queryResults[queryResults.length - 1].triggeredByCorrelationId, "corr-aud-100");
});

