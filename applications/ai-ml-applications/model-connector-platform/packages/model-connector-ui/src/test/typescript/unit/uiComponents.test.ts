import test from "node:test";
import assert from "node:assert/strict";
import { authStore } from "@/stores/AuthStore";
import { workflowBuilderStore } from "@/stores/WorkflowBuilderStore";
import { OnboardingValidators } from "@/schemas/onboarding.schemas";
import {
  groupSidebarMenus,
  getUserInitials,
  resolveMenuDisplayLabel,
  ROUTE_BREADCRUMB_MAP,
} from "@/constants/navigationConstants";
import { resolveIntegrationCrudPermissions } from "@/utils/auth/rbacPermissions";
import type { UiMenuItem } from "@/types/ui.types";

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

test("NavigationConstants - groups menus into Connections and Workspace sections and computes user initials", () => {
  const sampleMenus: readonly UiMenuItem[] = [
    { menuId: "chat", menuLabel: "Dashboard", menuIcon: "💬", routePath: "chat", sortOrder: 1, isDefault: true },
    { menuId: "models", menuLabel: "Models", menuIcon: "🤖", routePath: "models", sortOrder: 3, isDefault: false },
    { menuId: "model-config", menuLabel: "Configuration", menuIcon: "⚙️", routePath: "model-config", sortOrder: 2, isDefault: true },
    { menuId: "sessions", menuLabel: "Sessions", menuIcon: "🗂️", routePath: "sessions", sortOrder: 4, isDefault: false },
    { menuId: "upstream", menuLabel: "Observability", menuIcon: "📡", routePath: "upstream", sortOrder: 5, isDefault: false },
  ];

  const grouped = groupSidebarMenus(sampleMenus);
  assert.equal(grouped.primaryMenus.length, 1);
  assert.equal(grouped.connectionMenus.length, 3);
  assert.equal(grouped.connectionMenus[0].routePath, "model-config");
  assert.equal(resolveMenuDisplayLabel(grouped.connectionMenus[0]), "Integration Hub");
  assert.equal(grouped.workspaceMenus.length, 1);
  assert.equal(getUserInitials("Platform Admin"), "PA");
  assert.equal(getUserInitials(undefined), "PA");
  assert.equal(ROUTE_BREADCRUMB_MAP["model-config"].label, "Integration Hub");
  assert.equal(ROUTE_BREADCRUMB_MAP.models.parent, "Connections");
});

test("RbacPermissions - resolves CRUD capabilities by explicit permissions and canonical roles", () => {
  const adminAccess = resolveIntegrationCrudPermissions({
    roleId: "role-admin",
    roleName: "Platform Administrator",
    permissions: ["integrations:read", "integrations:create", "integrations:update", "integrations:delete"],
  });
  assert.equal(adminAccess.canRead, true);
  assert.equal(adminAccess.canCreate, true);
  assert.equal(adminAccess.canUpdate, true);
  assert.equal(adminAccess.canDelete, true);
  assert.equal(adminAccess.accessTierLabel, "Full CRUD");

  const devAccess = resolveIntegrationCrudPermissions({
    roleId: "role-developer",
    roleName: "Developer",
    permissions: ["integrations:read", "integrations:create", "integrations:update"],
  });
  assert.equal(devAccess.canRead, true);
  assert.equal(devAccess.canCreate, true);
  assert.equal(devAccess.canUpdate, true);
  assert.equal(devAccess.canDelete, false);
  assert.equal(devAccess.accessTierLabel, "Create · Read · Update");

  const viewerAccess = resolveIntegrationCrudPermissions({
    roleId: "role-viewer",
    roleName: "Read-Only Auditor",
    permissions: [],
  });
  assert.equal(viewerAccess.canRead, true);
  assert.equal(viewerAccess.canCreate, false);
  assert.equal(viewerAccess.canUpdate, false);
  assert.equal(viewerAccess.canDelete, false);
  assert.equal(viewerAccess.accessTierLabel, "Read-Only");

  const guestAccess = resolveIntegrationCrudPermissions(null);
  assert.equal(guestAccess.canRead, false);
  assert.equal(guestAccess.accessTierLabel, "Restricted");
});
