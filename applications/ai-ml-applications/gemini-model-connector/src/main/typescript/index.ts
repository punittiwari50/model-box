import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { config } from "@/core/config/index.js";
import { apiRouter } from "@/core/web/routes/apiRoutes.js";
import { dataSourceManager } from "@/core/datasource/dataSourceManager.js";
import { logger } from "@/core/observability/logging/logger.js";
import { resolveFromModule } from "@/core/utils/io/pathUtils.js";
import { traceMiddleware } from "@/core/observability/tracing/traceMiddleware.js";

async function bootstrap() {
  const app = express();
  app.disable("x-powered-by");
  delete process.env.NODE_VERSION;

  // Distributed Tracing & Correlation Middleware (Micrometer / W3C TraceContext)
  app.use(traceMiddleware());

  // Ensure runtime storage directories exist
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.artifactsDir, { recursive: true });
  fs.mkdirSync(config.agentsDir, { recursive: true });

  // Initialize SQLite datasource
  await dataSourceManager.getDriver();

  // Security headers & Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: `${config.maxFileSizeBytes}b` }));
  app.use(
    express.urlencoded({
      extended: true,
      limit: `${config.maxFileSizeBytes}b`,
    }),
  );

  // Request logger middleware: outputs every incoming request and response status to Docker logs in real time
  app.use(logger.requestLoggerMiddleware());

  // Basic security headers complying with mandatory-secure-web-skills
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    );
    next();
  });

  // REST API Routes
  app.use("/api/v1", apiRouter);

  // Serve Single-Page Web Dashboard from resources (Directive #6)
  const resourcesDir = resolveFromModule(import.meta.url, "resources");
  const devResourcesDir = resolveFromModule(import.meta.url, "../resources");
  const projectResourcesDir = resolveFromModule(
    import.meta.url,
    "../../main/resources",
  );
  const activeResourcesDir = fs.existsSync(resourcesDir)
    ? resourcesDir
    : fs.existsSync(devResourcesDir)
      ? devResourcesDir
      : projectResourcesDir;

  if (fs.existsSync(activeResourcesDir)) {
    // Dynamic SCSS stylesheet handler conforming to Directive #4 & #6 (pure SCSS from resources/assets)
    app.get("/assets/scss/main.scss", (_req, res) => {
      const cssPath = path.join(
        activeResourcesDir,
        "assets",
        "css",
        "main.css",
      );
      if (fs.existsSync(cssPath)) {
        res.type("text/css").send(fs.readFileSync(cssPath, "utf-8"));
        return;
      }
      const scssPath = path.join(
        activeResourcesDir,
        "assets",
        "scss",
        "main.scss",
      );
      if (fs.existsSync(scssPath)) {
        res.type("text/css").send(fs.readFileSync(scssPath, "utf-8"));
        return;
      }
      res.status(404).send("SCSS not found");
    });

    const assetsDir = path.join(activeResourcesDir, "assets");
    if (fs.existsSync(assetsDir)) {
      app.use("/assets", express.static(assetsDir));
    }
    app.use(express.static(activeResourcesDir));

    app.get("/", (_req, res) => {
      const indexPath = path.join(activeResourcesDir, "static", "index.html");
      const rootIndexPath = path.join(activeResourcesDir, "index.html");
      res.sendFile(fs.existsSync(indexPath) ? indexPath : rootIndexPath);
    });
  }

  // Generic 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
  });

  // Global Error Handler
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error(
        "SERVER",
        `Unhandled server error: ${err.message}`,
        err.stack,
      );
      res.status(500).json({ error: "Internal server error occurred." });
    },
  );

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      "SERVER",
      `=======================================================`,
    );
    logger.info(
      "SERVER",
      `  GEMINI MODEL CONNECTOR (Node.js Server Side)        `,
    );
    logger.info(
      "SERVER",
      `=======================================================`,
    );
    logger.info(
      "SERVER",
      `  * Local Server:      http://${config.host}:${config.port}`,
    );
    logger.info(
      "SERVER",
      `  * Health Endpoint:   http://${config.host}:${config.port}/api/v1/health`,
    );
    logger.info("SERVER", `  * Model CLI Target:  ${config.geminiCliCommand}`);
    logger.info(
      "SERVER",
      `  * Default Model:     ${config.geminiDefaultModel}`,
    );
    logger.info("SERVER", `  * Data Directory:    ${config.dataDir}`);
    logger.info("SERVER", `  * Artifacts Output:  ${config.artifactsDir}`);
    logger.info(
      "SERVER",
      `=======================================================`,
    );
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info("SERVER", "Gracefully terminating server...");
    server.close(async () => {
      const driver = await dataSourceManager.getDriver();
      await driver.close();
      logger.info("SERVER", "Closed datasource and network listeners.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  logger.error("SERVER", `Fatal bootstrap error: ${err.message}`, err.stack);
  process.exit(1);
});
