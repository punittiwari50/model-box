import test from "node:test";
import assert from "node:assert/strict";
import { authStore } from "@/stores/AuthStore";
import { workflowBuilderStore } from "@/stores/WorkflowBuilderStore";
import { OnboardingValidators } from "@/schemas/onboarding.schemas";

test("AuthStore - manages in-memory authentication and tenant context", () => {
  // Initial state
  const initial = authStore.getState();
  assert.equal(initial.isAuthenticated, false);
  assert.equal(initial.accessToken, null);

  // Authenticate
  authStore.setAuthenticated(
    "jwt-mock-token-sample-1234567890",
    "GOOGLE_GIS",
    "user-99",
    "developer@enterprise.io",
    "tenant-alpha",
    "JOB_PORTAL",
  );

  const authed = authStore.getState();
  assert.equal(authed.isAuthenticated, true);
  assert.equal(authed.authMode, "GOOGLE_GIS");
  assert.equal(authed.userId, "user-99");
  assert.equal(authed.userEmail, "developer@enterprise.io");
  assert.equal(authed.tenantId, "tenant-alpha");
  assert.equal(authed.tenantScope, "JOB_PORTAL");

  // CSRF token
  authStore.setCsrfToken("csrf-token-sample");
  assert.equal(authStore.getState().csrfToken, "csrf-token-sample");

  // Logout
  authStore.logout();
  const loggedOut = authStore.getState();
  assert.equal(loggedOut.isAuthenticated, false);
  assert.equal(loggedOut.accessToken, null);
});

test("WorkflowBuilderStore - tracks DAG node status and logs transitions", () => {
  const state = workflowBuilderStore.getState();
  assert.ok(state.nodes.length >= 4);
  assert.ok(state.edges.length >= 4);

  // Select node
  workflowBuilderStore.selectNode("step-1");
  assert.equal(workflowBuilderStore.getState().selectedNodeId, "step-1");

  // Update node status
  workflowBuilderStore.updateNodeStatus("step-4", "SUCCESS", 100, "Cascade executed cleanly");
  const updatedNode = workflowBuilderStore.getState().nodes.find((n) => n.stepId === "step-4");
  assert.equal(updatedNode?.status, "SUCCESS");
  assert.equal(updatedNode?.progressPercent, 100);
  assert.equal(updatedNode?.outputSummary, "Cascade executed cleanly");

  // Add log
  workflowBuilderStore.addLog("[Test] Manual verification log");
  assert.ok(workflowBuilderStore.getState().executionLogs.includes("[Test] Manual verification log"));
});

test("OnboardingValidators - enforces strict contract rules across domain inputs", () => {
  // 1. Auth validation
  const invalidAuth = OnboardingValidators.validateAuthOnboarding({
    authMode: "GOOGLE_GIS",
    idToken: "short",
    tenantScope: "JOB_PORTAL",
    selectedCapabilities: [],
  });
  assert.equal(invalidAuth.success, false);
  assert.ok(invalidAuth.errors && invalidAuth.errors.length >= 2);

  const validAuth = OnboardingValidators.validateAuthOnboarding({
    authMode: "GOOGLE_GIS",
    idToken: "valid-jwt-token-with-proper-length-greater-than-twenty",
    tenantScope: "JOB_PORTAL",
    selectedCapabilities: ["inference"],
  });
  assert.equal(validAuth.success, true);

  // 2. Resume validation
  const oversizedResume = OnboardingValidators.validateResumeUpload({
    fileName: "large.pdf",
    fileSize: 15 * 1024 * 1024, // 15MB
    fileType: "application/pdf",
    targetJobDescription: "Valid target job description exceeding 30 characters",
    autoMutateMissingSkills: false,
  });
  assert.equal(oversizedResume.success, false);

  const validResume = OnboardingValidators.validateResumeUpload({
    fileName: "valid_resume.pdf",
    fileSize: 500 * 1024,
    fileType: "application/pdf",
    targetJobDescription: "Valid target job description exceeding 30 characters",
    autoMutateMissingSkills: true,
  });
  assert.equal(validResume.success, true);

  // 3. Skill MD validation
  const invalidSkill = OnboardingValidators.validateSkillMd({
    skillContent: "Missing frontmatter",
    targetLanguage: "TYPESCRIPT",
    runSandboxTests: true,
  });
  assert.equal(invalidSkill.success, false);

  const validSkill = OnboardingValidators.validateSkillMd({
    skillContent: "---\nname: my-skill\nversion: 1.0.0\n---\n# My Skill\n\nInstructions here",
    targetLanguage: "TYPESCRIPT",
    runSandboxTests: true,
  });
  assert.equal(validSkill.success, true);

  // 4. Storyteller prompt validation
  const invalidStory = OnboardingValidators.validateStorytellerPrompt({
    narrativeText: "Short",
    artStyle: "CINEMATIC_PHOTOREALISTIC",
    voiceId: "",
    aspectRatio: "16:9",
    hitlCheckpointEnabled: true,
  });
  assert.equal(invalidStory.success, false);

  const validStory = OnboardingValidators.validateStorytellerPrompt({
    narrativeText: "A valid cinematic journey through an abandoned cybernetic metropolis under perpetual neon rain.",
    artStyle: "CINEMATIC_PHOTOREALISTIC",
    voiceId: "voice-1",
    aspectRatio: "16:9",
    hitlCheckpointEnabled: true,
  });
  assert.equal(validStory.success, true);
});
