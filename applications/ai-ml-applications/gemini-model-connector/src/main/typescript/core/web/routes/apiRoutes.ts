import { Router, Request, Response } from "express";
import { authController } from "@/controllers/authController.js";
import { conversationController } from "@/controllers/conversationController.js";
import { jobSearchController } from "@/controllers/jobSearchController.js";
import { auditController } from "@/controllers/auditController.js";
import { modelController } from "@/controllers/modelController.js";
import { agentController } from "@/controllers/agentController.js";
import { interactionController } from "@/controllers/interactionController.js";
import { defaultModelRunner } from "@/core/cli/modelRunnerFactory.js";
import { config } from "@/core/config/index.js";
import { modelApiKeyRegistry } from "@/core/config/security/modelApiKeyProvider.js";
import {
  HttpStatus,
  CommonStatus,
  DefaultServiceConstant,
} from "@/domain/constants/index.js";
import { sendJsonResponse } from "@/core/web/helper/responseHelper.js";
import { securityFilter } from "@/core/web/middleware/securityFilter.js";
import { IdempotencyFilter } from "@/core/web/middleware/idempotencyFilter.js";
import { RequestValidationFilter } from "@/core/web/middleware/requestValidator.js";
import { sanitizingErrorFilter } from "@/core/web/middleware/sanitizingErrorFilter.js";

export const apiRouter = Router();
const cliRunner = defaultModelRunner;

// Global Pipeline Filters: Security & Anti-PII, followed by Idempotency Interceptor
apiRouter.use(securityFilter);
apiRouter.use(IdempotencyFilter.handle);

// -------------------------------------------------------------
// Health Check Endpoint (Distributed Trace-Aware)
// -------------------------------------------------------------
apiRouter.get("/health", (_req: Request, res: Response) => {
  const cliAvailable = cliRunner.isCliAvailable();
  const hasApiKey = Boolean(modelApiKeyRegistry.getApiKey());

  sendJsonResponse(res, HttpStatus.OK, {
    status: CommonStatus.HEALTHY,
    service: DefaultServiceConstant.SERVICE_NAME,
    cli_status: {
      command: config.geminiCliCommand,
      available_on_path: cliAvailable,
      mode: cliAvailable
        ? DefaultServiceConstant.HEADLESS_CLI
        : DefaultServiceConstant.SIMULATION_FALLBACK,
      default_model: config.geminiDefaultModel,
    },
    api_status: {
      has_api_key: hasApiKey,
      execution_mode: config.geminiExecutionMode,
      base_url: config.geminiApiBaseUrl,
      default_model: config.geminiDefaultModel,
    },
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// Authentication Endpoints (Dynamic, Multi-Model, Trace-Aware)
// -------------------------------------------------------------
apiRouter.get("/auth/status", (req: Request, res: Response) =>
  authController.getStatus(req, res),
);
apiRouter.get("/auth/login", (req: Request, res: Response) =>
  authController.initiateLogin(req, res),
);
apiRouter.post("/auth/login", (req: Request, res: Response) =>
  authController.directLogin(req, res),
);
apiRouter.get("/auth/callback", (req: Request, res: Response) =>
  authController.handleOAuthCallback(req, res),
);
apiRouter.post("/auth/logout", (req: Request, res: Response) =>
  authController.logout(req, res),
);
apiRouter.post("/auth/session/switch", (req: Request, res: Response) =>
  authController.switchActiveSession(req, res),
);
apiRouter.delete("/auth/models/:model", (req: Request, res: Response) =>
  authController.logoutModelParam(req, res),
);

// Dynamic Model & Provider Redirect: Replaces static /auth/google
apiRouter.get("/auth/provider/:provider", (req: Request, res: Response) =>
  authController.redirectToProvider(req, res),
);
apiRouter.get("/auth/google", (req: Request, res: Response) =>
  authController.redirectToProvider(req, res),
);

// -------------------------------------------------------------
// Live Discovered Models & Subscription Tiers (CLI & API-backed)
// -------------------------------------------------------------
apiRouter.get("/models", (req: Request, res: Response) =>
  modelController.listModels(req, res),
);
apiRouter.get("/models/:model", (req: Request, res: Response) =>
  modelController.getModel(req, res),
);

// -------------------------------------------------------------
// Conversation Endpoints
// -------------------------------------------------------------
apiRouter.post(
  "/conversations",
  RequestValidationFilter.validateCreateConversation,
  (req: Request, res: Response) =>
    conversationController.createConversation(req, res),
);
apiRouter.get("/conversations", (req: Request, res: Response) =>
  conversationController.listConversations(req, res),
);
apiRouter.get("/conversations/sessions", (req: Request, res: Response) =>
  conversationController.listSessions(req, res),
);
apiRouter.get("/conversations/:id", (req: Request, res: Response) =>
  conversationController.getConversation(req, res),
);
apiRouter.delete("/conversations/:id", (req: Request, res: Response) =>
  conversationController.deleteConversation(req, res),
);
apiRouter.post("/conversations/chat", (req: Request, res: Response) =>
  conversationController.chat(req, res),
);
apiRouter.post(
  "/conversations/:id/messages",
  RequestValidationFilter.validateSendMessage,
  (req: Request, res: Response) => conversationController.sendMessage(req, res),
);
apiRouter.post("/conversations/:id/resume", (req: Request, res: Response) =>
  conversationController.resumeConversation(req, res),
);
apiRouter.post("/conversations/:id/context", (req: Request, res: Response) =>
  conversationController.attachContext(req, res),
);

// -------------------------------------------------------------
// Autonomous Agent Endpoints (Gemini CLI / MCP Agent Mode)
// -------------------------------------------------------------
apiRouter.post("/agents/execute", (req: Request, res: Response) =>
  agentController.execute(req, res),
);
apiRouter.post("/agents", (req: Request, res: Response) =>
  agentController.execute(req, res),
);
apiRouter.post("/agent/execute", (req: Request, res: Response) =>
  agentController.execute(req, res),
);
apiRouter.post("/agent", (req: Request, res: Response) =>
  agentController.execute(req, res),
);
apiRouter.get("/agents", (req: Request, res: Response) =>
  agentController.list(req, res),
);
apiRouter.get("/agent", (req: Request, res: Response) =>
  agentController.list(req, res),
);
apiRouter.get("/agents/skills", (req: Request, res: Response) =>
  agentController.listSkills(req, res),
);
apiRouter.get("/agents/:id", (req: Request, res: Response) =>
  agentController.getById(req, res),
);
apiRouter.get("/agent/:id", (req: Request, res: Response) =>
  agentController.getById(req, res),
);
apiRouter.post("/agents/:id/cancel", (req: Request, res: Response) =>
  agentController.cancel(req, res),
);
apiRouter.post("/agent/:id/cancel", (req: Request, res: Response) =>
  agentController.cancel(req, res),
);

// -------------------------------------------------------------
// Unified Interaction Endpoint (Polymorphic Strategy: Conversation vs Agent)
// -------------------------------------------------------------
apiRouter.post("/interaction", (req: Request, res: Response) =>
  interactionController.interact(req, res),
);
apiRouter.post("/interact", (req: Request, res: Response) =>
  interactionController.interact(req, res),
);

// -------------------------------------------------------------
// Job Search Agent Endpoints
// -------------------------------------------------------------
apiRouter.post(
  "/job-search/analyze",
  RequestValidationFilter.validateJobSearch,
  (req: Request, res: Response) => jobSearchController.analyze(req, res),
);
apiRouter.get(
  "/job-search/artifacts/:filename",
  (req: Request, res: Response) =>
    jobSearchController.downloadArtifact(req, res),
);

// -------------------------------------------------------------
// Compliance Audit Logs Endpoint
// -------------------------------------------------------------
apiRouter.get("/audit/logs", (req: Request, res: Response) =>
  auditController.getLogs(req, res),
);

// Global Error Sanitization Filter (Requirement #8: zero sensitive or SQL leak)
apiRouter.use(sanitizingErrorFilter);
