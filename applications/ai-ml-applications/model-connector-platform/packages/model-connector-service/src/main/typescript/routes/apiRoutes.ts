import { Router } from "express";
import { healthController } from "@/controllers/healthController";
import { modelController } from "@/controllers/modelController";
import { inferenceController } from "@/controllers/inferenceController";
import { sessionController } from "@/controllers/sessionController";
import { upstreamController } from "@/controllers/upstreamController";
import { accountController } from "@/controllers/accountController";
import { categoryController } from "@/controllers/categoryController";
import { summaryController } from "@/controllers/summaryController";
import { authController } from "@/controllers/authController";
import { menuController } from "@/controllers/menuController";
import { modelConfigController } from "@/controllers/modelConfigController";
import { integrationController } from "@/controllers/integrationController";
import { RbacPermission } from "@/constants/index";
import { requirePermission } from "@/middleware/rbacMiddleware";
import { validateChatRequest } from "@/middleware/validationMiddleware";
import { ResumeAstService } from "@/services/job/ResumeAstService";
import { SkillCompilerService } from "@/services/apps/SkillCompilerService";
import { ComfyUiOrchestrator } from "@/services/story/ComfyUiOrchestrator";
import { RestrictionAuditService, type RestrictionScope } from "@/services/audit/RestrictionAuditService";
import { oauthCallbackServer } from "@/services/oauthCallbackServer";

export const apiRouter = Router();


// Health Check
apiRouter.get("/health", (req, res) => healthController.getHealth(req, res));
apiRouter.get("/health/database", (req, res) => healthController.getDatabaseHealth(req, res));

// Authentication & Identity
apiRouter.post("/auth/login", (req, res, next) => authController.login(req, res).catch(next));
apiRouter.get("/auth/me", (req, res, next) => authController.getMe(req, res).catch(next));
apiRouter.get("/auth/demo-users", (req, res, next) => authController.listDemoUsers(req, res).catch(next));

// Dynamic Navigation Menus & RBAC
apiRouter.get("/navigation/menus", (req, res, next) => menuController.getMenus(req, res).catch(next));
apiRouter.get("/navigation/menus/all", (req, res, next) => menuController.getAllMenus(req, res).catch(next));
apiRouter.get("/rbac/matrix", (req, res, next) => menuController.getRbacMatrix(req, res).catch(next));

// Dynamic Model Categories
apiRouter.get("/categories", (req, res) => categoryController.getCategories(req, res));

// Models Discovery
apiRouter.get("/models", (req, res) => modelController.listModels(req, res));
apiRouter.get("/models/:id", (req, res) => modelController.getModel(req, res));

// Omni-Channel Model Inference
apiRouter.post("/chat", validateChatRequest, (req, res, next) =>
  inferenceController.chat(req, res).catch(next),
);
apiRouter.post("/chat/stream", validateChatRequest, (req, res, next) =>
  inferenceController.streamChat(req, res).catch(next),
);

// Session Lineage & Persistent Conversation History
apiRouter.get("/sessions", (req, res, next) => sessionController.listSessions(req, res).catch(next));
apiRouter.post("/sessions", (req, res, next) => sessionController.createSession(req, res).catch(next));
apiRouter.delete("/sessions/cleanup-test-data", (req, res, next) => sessionController.cleanupTestSessions(req, res).catch(next));
apiRouter.post("/sessions/cleanup-test-data", (req, res, next) => sessionController.cleanupTestSessions(req, res).catch(next));
apiRouter.get("/sessions/:id", (req, res, next) => sessionController.getSession(req, res).catch(next));
apiRouter.get("/sessions/:id/messages", (req, res, next) => sessionController.getSessionMessages(req, res).catch(next));
apiRouter.delete("/sessions/:id", (req, res, next) => sessionController.deleteSession(req, res).catch(next));

// Integration Hub Onboarding & CRUD (RBAC Protected)
apiRouter.get(
  "/integrations",
  requirePermission(RbacPermission.INTEGRATIONS_READ, RbacPermission.MODELS_READ),
  (req, res, next) => integrationController.listIntegrations(req, res).catch(next),
);
apiRouter.post(
  "/integrations",
  requirePermission(RbacPermission.INTEGRATIONS_CREATE, RbacPermission.ONBOARDING_MANAGE),
  (req, res, next) => integrationController.createIntegration(req, res).catch(next),
);
apiRouter.put(
  "/integrations/:integrationId",
  requirePermission(RbacPermission.INTEGRATIONS_UPDATE, RbacPermission.MODELS_MANAGE),
  (req, res, next) => integrationController.updateIntegration(req, res).catch(next),
);
apiRouter.delete(
  "/integrations/:integrationId",
  requirePermission(RbacPermission.INTEGRATIONS_DELETE, RbacPermission.MODELS_MANAGE),
  (req, res, next) => integrationController.deleteIntegration(req, res).catch(next),
);

// Model Multi-Account & Credential CRUD (Per Model ID, RBAC Protected)
apiRouter.get(
  "/accounts",
  requirePermission(RbacPermission.INTEGRATIONS_READ, RbacPermission.MODELS_READ),
  (req, res) => accountController.listAllAccounts(req, res),
);
apiRouter.get(
  "/models/:modelId/accounts",
  requirePermission(RbacPermission.INTEGRATIONS_READ, RbacPermission.MODELS_READ),
  (req, res) => accountController.listAccountsByModel(req, res),
);
apiRouter.post(
  "/models/:modelId/accounts",
  requirePermission(RbacPermission.INTEGRATIONS_CREATE, RbacPermission.MODELS_MANAGE),
  (req, res) => accountController.createAccount(req, res),
);
apiRouter.put(
  "/models/:modelId/accounts/:accountId",
  requirePermission(RbacPermission.INTEGRATIONS_UPDATE, RbacPermission.MODELS_MANAGE),
  (req, res) => accountController.updateAccount(req, res),
);
apiRouter.post(
  "/models/:modelId/accounts/:accountId/activate",
  requirePermission(RbacPermission.INTEGRATIONS_UPDATE, RbacPermission.MODELS_MANAGE),
  (req, res) => accountController.activateAccount(req, res),
);
apiRouter.post(
  "/models/:modelId/accounts/:accountId/deactivate",
  requirePermission(RbacPermission.INTEGRATIONS_UPDATE, RbacPermission.MODELS_MANAGE),
  (req, res) => accountController.deactivateAccount(req, res),
);
apiRouter.delete(
  "/models/:modelId/accounts/:accountId",
  requirePermission(RbacPermission.INTEGRATIONS_DELETE, RbacPermission.MODELS_MANAGE),
  (req, res) => accountController.deleteAccount(req, res),
);

// Model Protocol Verification (API, CLI, Cookie, OAuth) & Multi-Client OAuth DB Registry
apiRouter.get("/models/providers/catalog", (req, res, next) =>
  modelConfigController.getProviderCatalog(req, res).catch(next),
);
apiRouter.get("/models/providers/:providerId/models", (req, res, next) =>
  modelConfigController.getProviderModelsCached(req, res).catch(next),
);
apiRouter.get("/models/providers/:providerId/oauth-clients", (req, res) =>
  modelConfigController.listProviderOAuthClients(req, res),
);
apiRouter.post("/models/providers/:providerId/oauth-clients", (req, res) =>
  modelConfigController.upsertProviderOAuthClient(req, res),
);
apiRouter.delete("/models/providers/:providerId/oauth-clients/:clientConfigId", (req, res) =>
  modelConfigController.deleteProviderOAuthClient(req, res),
);
apiRouter.post("/models/config/test-connection", (req, res) =>
  modelConfigController.testConnection(req, res),
);
apiRouter.get("/models/:modelId/oauth-config", (req, res) =>
  modelConfigController.getOAuthConfig(req, res),
);
apiRouter.post("/models/:modelId/oauth-exchange", (req, res) =>
  modelConfigController.exchangeOAuthToken(req, res),
);
apiRouter.post("/models/:modelId/cli-login", (req, res) =>
  modelConfigController.executeCliLogin(req, res),
);
apiRouter.post("/models/:modelId/cli-auth-complete", (req, res) =>
  modelConfigController.completeCliAuth(req, res),
);
apiRouter.get("/auth/cli-session/latest", (req, res) =>
  modelConfigController.getLatestCliSession(req, res),
);
apiRouter.get("/models/cli-sessions/latest", (req, res) =>
  modelConfigController.getLatestCliSession(req, res),
);
apiRouter.get("/models/:modelId/cli-sessions/latest", (req, res) =>
  modelConfigController.getLatestCliSession(req, res),
);
apiRouter.post("/auth/cli-session/submit-code", (req, res) =>
  modelConfigController.submitCliAuthCode(req, res),
);
apiRouter.get("/auth/cli-sessions", (req, res) =>
  modelConfigController.listCliSessions(req, res),
);
apiRouter.post("/auth/cli-session/sync", (req, res) =>
  modelConfigController.syncCliSession(req, res),
);
apiRouter.get("/models/:modelId/bidirectional-credentials", (req, res) =>
  modelConfigController.getBidirectionalCredentials(req, res),
);
apiRouter.get("/models/:modelId/latest-oauth-callback", (req, res) =>
  modelConfigController.getLatestOAuthCallback(req, res),
);
apiRouter.post("/models/:modelId/verify-oauth-manual", (req, res) =>
  modelConfigController.verifyOAuthManual(req, res),
);
apiRouter.get("/models/:modelId/vcs/status", (req, res) =>
  modelConfigController.getVcsStatus(req, res),
);
apiRouter.post("/models/:modelId/vcs/verify", (req, res) =>
  modelConfigController.verifyCredentialsDirectory(req, res),
);
apiRouter.get("/oauth2callback", (req, res) =>
  oauthCallbackServer.handleCallback(req, res),
);


// Upstream gemini-model-connector Integration
apiRouter.get("/upstream/status", (req, res) => upstreamController.getStatus(req, res));
apiRouter.get("/upstream/audit", (req, res) => upstreamController.getAuditLogs(req, res));

// UC-11 Executive Summary & Task State Hub
apiRouter.get("/summary/latest", (req, res) => summaryController.getLatestSummary(req, res));
apiRouter.post("/summary/generate", (req, res) => summaryController.generateSummary(req, res));
apiRouter.post("/tasks/transition", (req, res) => summaryController.recordTaskTransition(req, res));

// Resilient Workflow Resumption & Tamper Detection
apiRouter.post("/workflows/resume", (req, res) => summaryController.resumeWorkflow(req, res));

// Pipelines (Job, Apps Builder, Storyteller, Audit)
apiRouter.post("/workflows/job/parse-resume", (req, res) => {
  const ast = ResumeAstService.parseResumeText(req.body.resumeText || "");
  const scorecard = ResumeAstService.generateScorecard(ast, req.body.targetRole || "Software Engineer");
  res.json({ success: true, ast, scorecard });
});

apiRouter.post("/workflows/apps/compile-skill", (req, res) => {
  const manifest = SkillCompilerService.compileSkillMarkdown(req.body.skillMarkdown || "");
  res.json({ success: true, manifest });
});

apiRouter.post("/workflows/story/generate", (req, res) => {
  const dag = ComfyUiOrchestrator.generateWorkflowDag(
    req.body.prompt || "A cinematic AI journey",
    4,
    {
      correlationId: req.correlationId,
      traceId: req.traceContext?.traceId,
      spanId: req.traceContext?.spanId,
    },
  );
  res.json({
    success: true,
    dag,
    correlationId: req.correlationId,
    traceId: req.traceContext?.traceId,
    spanId: req.traceContext?.spanId,
  });
});

apiRouter.get("/audit/restrictions", (req, res) => {
  const records = RestrictionAuditService.queryAuditTrail(
    req.query.scope as RestrictionScope,
    req.query.entityId as string,
  );
  res.json({ success: true, records });
});
