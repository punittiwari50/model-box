import express from "express";
import cors from "cors";
import helmet from "helmet";
import { appConfig } from "@/config/index";
import { ServiceConstant } from "@/constants/index";
import { correlationMiddleware } from "@/middleware/correlationMiddleware";
import { piiUrlGuardMiddleware } from "@/middleware/securitySanitizerMiddleware";
import { errorMiddleware } from "@/middleware/errorMiddleware";
import { apiRouter } from "@/routes/apiRoutes";
import { oauthCallbackServer } from "@/services/oauthCallbackServer";
import { ollamaOAuthGatewayServer } from "@/services/ollamaOAuthGatewayServer";
import { processUtils, cliOAuthSessionRepository, timerUtils } from "@model-box/model-connector-core";


const app = express();

app.use(helmet());
app.use(cors({ origin: appConfig.corsOrigins === "*" ? true : appConfig.corsOrigins.split(",") }));
app.use(express.json({ limit: "10mb" }));
app.use(correlationMiddleware);
app.use(piiUrlGuardMiddleware);

// OAuth 2.0 loopback redirect & Ollama OAuth 2.0 Gateway endpoints
app.get("/oauth2callback", (req, res) => oauthCallbackServer.handleCallback(req, res));
app.use("/ollama-oauth", ollamaOAuthGatewayServer.router);
app.use(ServiceConstant.API_PREFIX, apiRouter);
app.use(errorMiddleware);

const server = app.listen(appConfig.port, appConfig.host, () => {
  console.log(
    `[${ServiceConstant.SERVICE_NAME}] Server running on http://${appConfig.host}:${appConfig.port}${ServiceConstant.API_PREFIX}`,
  );
  console.log(`[${ServiceConstant.SERVICE_NAME}] Upstream URL: ${appConfig.geminiConnectorUrl}`);
  // Start loopback listener on port 8085 for Gemini CLI OAuth callback
  oauthCallbackServer.start(8085);
  // Start Ollama OAuth 2.0 Gateway listener on port 11436 (Use Case 2: Ollama WITH OAuth)
  ollamaOAuthGatewayServer.start(11436);

  // Initial sync of CLI OAuth sessions from CSV to database
  cliOAuthSessionRepository.syncFromCsv();
  // Periodic background CSV to SQLite sync
  timerUtils.setInterval(() => {
    cliOAuthSessionRepository.syncFromCsv();
  }, 5000);
});


processUtils.on("SIGTERM", () => gracefulShutdown(server));
processUtils.on("SIGINT", () => gracefulShutdown(server));

function gracefulShutdown(srv: ReturnType<typeof app.listen>): void {
  console.log("[SHUTDOWN] Received signal, closing HTTP server...");
  srv.close(() => {
    console.log("[SHUTDOWN] HTTP server closed gracefully.");
    processUtils.exit(0);
  });
}

export { app };
