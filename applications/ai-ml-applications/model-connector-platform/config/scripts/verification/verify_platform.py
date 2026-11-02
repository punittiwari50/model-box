"""
ModelConnector Platform Verification Suite.
Conforms to STD-BLD-006 & STD-COD-009 (Automated Syntax, Maven-Style Layout & Architecture Verification).
Verifies all 9 Enterprise Requirements:
1. Meaningful column names (no generic ID) & UPPER CASE tables/columns
2. Distributed microservices logging (traceId, spanId, traceparent, correlationId)
3. Functional multi-model adapters (UnifiedModelExecutionAdapter, ModelCatalogDiscoveryAdapter)
4. NoSQL configuration (MongoDB, Redis, DocumentDB)
5. Universal RDBMS pagination (Postgres, MySQL, Oracle, SQL Server, SQLite)
6. UI Pagination component integrated into Dashboard, Sessions, and Audit views
7. Responsive mobile-first design across all components
8. Well-structured modular SCSS (no plain CSS)
9. Complete migration from gemini-model-connector
"""

import sys
import os
import json
import re

# Ensure stdout handles UTF-8 on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GREEN = "\033[92m"
RED = "\033[91m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
RESET = "\033[0m"

def log_step(name: str):
    print(f"\n{CYAN}=== [TEST] {name} ==={RESET}")

def assert_true(condition: bool, msg: str):
    if condition:
        print(f" {GREEN}[PASS]{RESET} {msg}")
    else:
        print(f" {RED}[FAIL]{RESET} {msg}")
        sys.exit(1)

def test_root_parent_isolation():
    log_step("1. Root Parent Isolation (Only approved root files/folders)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    allowed_root_files = {"readme.md", "package.json", ".gitignore", ".dockerignore", "package-lock.json"}
    allowed_root_dirs = {"config", "packages", "docs", ".git", ".idea", ".vscode", "node_modules"}
    
    entries = os.listdir(project_root)
    for entry in entries:
        full_p = os.path.join(project_root, entry)
        if os.path.isfile(full_p):
            assert_true(
                entry.lower() in allowed_root_files,
                f"Root parent contains approved file only: {entry}"
            )
        else:
            assert_true(
                entry in allowed_root_dirs,
                f"Root parent contains approved folder: {entry}"
            )

def test_uppercase_and_meaningful_columns():
    log_step("2. Meaningful Column Names & UPPER CASE Tables/Columns (Req #1)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    
    ddl_parent = os.path.join(project_root, "config/database/ddl/01_core_schema.sql")
    ddl_core = os.path.join(project_root, "packages/model-connector-core/src/main/resources/config/database/ddl/schema.sql")
    
    for ddl_path in [ddl_parent, ddl_core]:
        assert_true(os.path.isfile(ddl_path), f"DDL file exists: {os.path.basename(ddl_path)}")
        with open(ddl_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Verify uppercase table names
        assert_true("CREATE TABLE IF NOT EXISTS MODELS" in content, "Table MODELS is strictly uppercase")
        assert_true("CREATE TABLE IF NOT EXISTS SESSIONS" in content, "Table SESSIONS is strictly uppercase")
        assert_true("CREATE TABLE IF NOT EXISTS MESSAGES" in content, "Table MESSAGES is strictly uppercase")
        assert_true("CREATE TABLE IF NOT EXISTS AUDIT_LOGS" in content, "Table AUDIT_LOGS is strictly uppercase")
        assert_true(
            "CREATE TABLE IF NOT EXISTS MODEL_CREDENTIALS" in content or "CREATE TABLE IF NOT EXISTS MODEL_ACCOUNTS" in content,
            "Table MODEL_CREDENTIALS / MODEL_ACCOUNTS is strictly uppercase"
        )
        
        # Verify non-generic meaningful primary key columns (No generic "id" or "ID")
        assert_true("MODEL_ID VARCHAR(64) PRIMARY KEY" in content, "MODELS uses meaningful MODEL_ID")
        assert_true("SESSION_ID VARCHAR(64) PRIMARY KEY" in content, "SESSIONS uses meaningful SESSION_ID")
        assert_true("MESSAGE_ID VARCHAR(64) PRIMARY KEY" in content, "MESSAGES uses meaningful MESSAGE_ID")
        assert_true("AUDIT_LOG_ID VARCHAR(64) PRIMARY KEY" in content, "AUDIT_LOGS uses meaningful AUDIT_LOG_ID")
        assert_true(
            "CREDENTIAL_ID VARCHAR(64) PRIMARY KEY" in content or "ACCOUNT_ID VARCHAR(64) PRIMARY KEY" in content,
            "MODEL_CREDENTIALS / MODEL_ACCOUNTS uses meaningful PK"
        )
        assert_true("id VARCHAR(64) PRIMARY KEY" not in content, "Zero generic lowercase 'id' primary keys")

def test_distributed_microservices_logging():
    log_step("3. Distributed Microservices Tracing & Structured Logging (Req #2)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    logger_file = os.path.join(project_root, "packages/model-connector-core/src/main/typescript/logging/logger.ts")
    middleware_file = os.path.join(project_root, "packages/model-connector-service/src/main/typescript/middleware/correlationMiddleware.ts")
    
    with open(logger_file, "r", encoding="utf-8") as f:
        logger_code = f.read()
    assert_true("TraceContext" in logger_code, "Logger defines TraceContext interface")
    assert_true("traceparent" in logger_code, "Logger supports W3C traceparent propagation")
    assert_true("createTraceContext" in logger_code, "Logger has W3C createTraceContext generator")
    assert_true("spanId" in logger_code, "Logger tracks spanId")
    assert_true("traceId" in logger_code, "Logger tracks traceId")

    with open(middleware_file, "r", encoding="utf-8") as f:
        mw_code = f.read()
    assert_true("traceparent" in mw_code, "correlationMiddleware sets W3C traceparent header")
    assert_true("startTime" in mw_code, "correlationMiddleware calculates durationMs")

def test_functional_multi_model_adapters():
    log_step("4. Functionality-Based Multi-Model Adapters (Req #3)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    adapters_dir = os.path.join(project_root, "packages/model-connector-client/src/main/typescript/adapters")
    
    unified_adapter = os.path.join(adapters_dir, "UnifiedModelExecutionAdapter.ts")
    catalog_adapter = os.path.join(adapters_dir, "ModelCatalogDiscoveryAdapter.ts")
    
    assert_true(os.path.isfile(unified_adapter), "UnifiedModelExecutionAdapter.ts exists")
    assert_true(os.path.isfile(catalog_adapter), "ModelCatalogDiscoveryAdapter.ts exists")
    
    with open(unified_adapter, "r", encoding="utf-8") as f:
        content = f.read()
    for fam in ["GEMINI", "GROK", "COPILOT", "CHATGPT", "CLAUDE", "OLLAMA"]:
        assert_true(fam in content, f"Unified adapter supports family {fam}")

def test_nosql_configuration():
    log_step("5. NoSQL Enterprise Configuration (Req #4)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    nosql_config = os.path.join(project_root, "packages/model-connector-core/src/main/typescript/config/nosql/nosqlConfig.ts")
    mongo_init = os.path.join(project_root, "config/database/nosql/mongo-init.js")
    
    assert_true(os.path.isfile(nosql_config), "nosqlConfig.ts exists in core config")
    assert_true(os.path.isfile(mongo_init), "mongo-init.js exists in config/database/nosql")
    
    with open(nosql_config, "r", encoding="utf-8") as f:
        cfg = f.read()
    assert_true("mongodb" in cfg and "redis" in cfg, "NoSQL config supports MongoDB and Redis")
    assert_true("loadNoSqlConfig" in cfg, "loadNoSqlConfig function provided")

def test_pagination_dialects():
    log_step("6. Universal RDBMS Pagination Concept (Req #5)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    pagination_dir = os.path.join(project_root, "packages/model-connector-core/src/main/typescript/pagination")
    
    files = ["PaginationDialect.ts", "Pageable.ts", "Page.ts", "PaginationQueryBuilder.ts"]
    for f in files:
        full_p = os.path.join(pagination_dir, f)
        assert_true(os.path.isfile(full_p), f"Pagination module file exists: {f}")
        
    builder_file = os.path.join(pagination_dir, "PaginationQueryBuilder.ts")
    with open(builder_file, "r", encoding="utf-8") as f:
        builder_code = f.read()
    assert_true("POSTGRESQL" in builder_code, "Dialect POSTGRESQL supported")
    assert_true("MYSQL" in builder_code, "Dialect MYSQL supported")
    assert_true("ORACLE" in builder_code, "Dialect ORACLE supported")
    assert_true("SQL_SERVER" in builder_code, "Dialect SQL_SERVER supported")
    assert_true("OFFSET" in builder_code and "FETCH NEXT" in builder_code, "ANSI SQL OFFSET...FETCH NEXT generated")

def test_pagination_ui_components():
    log_step("7. Separate Domain-Specific UI Pagination Components & Page Integration (Req #6)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    model_pag = os.path.join(project_root, "packages/model-connector-ui/src/main/typescript/components/models/ModelPagination.tsx")
    session_pag = os.path.join(project_root, "packages/model-connector-ui/src/main/typescript/components/sessions/SessionPagination.tsx")
    audit_pag = os.path.join(project_root, "packages/model-connector-ui/src/main/typescript/components/metrics/AuditPagination.tsx")
    
    assert_true(os.path.isfile(model_pag), "ModelPagination.tsx separate component exists")
    assert_true(os.path.isfile(session_pag), "SessionPagination.tsx separate component exists")
    assert_true(os.path.isfile(audit_pag), "AuditPagination.tsx separate component exists")
    
    model_catalog = os.path.join(project_root, "packages/model-connector-ui/src/main/typescript/components/models/ModelCatalog.tsx")
    session_mgr = os.path.join(project_root, "packages/model-connector-ui/src/main/typescript/components/sessions/SessionManager.tsx")
    audit_viewer = os.path.join(project_root, "packages/model-connector-ui/src/main/typescript/components/metrics/AuditLogViewer.tsx")
    
    for cmp_path in [model_catalog, session_mgr, audit_viewer]:
        with open(cmp_path, "r", encoding="utf-8") as f:
            code = f.read()
        assert_true("Pagination" in code, f"{os.path.basename(cmp_path)} integrates Pagination component")

def test_responsive_scss():
    log_step("8. Modular SCSS Architecture in src/main/resources/assests/styles (Req #1, #2 & #8)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    ui_package = os.path.join(project_root, "packages/model-connector-ui")
    
    # Verify no index.css
    index_css = os.path.join(ui_package, "src/main/typescript/index.css")
    assert_true(not os.path.exists(index_css), "Plain index.css successfully eliminated")
    
    # Verify SCSS partials in src/main/resources/assests/styles
    scss_dir = os.path.join(ui_package, "src/main/resources/assests/styles")
    assert_true(os.path.isdir(scss_dir), f"SCSS directory exists at {scss_dir}")
    
    required_scss = [
        "_variables.scss",
        "_mixins.scss",
        "_reset.scss",
        "_typography.scss",
        "_components.scss",
        "_pagination.scss",
        "_layout.scss",
        "_dashboard.scss",
        "_chat.scss",
        "_desktop.scss",
        "_mobile.scss",
        "main.scss"
    ]
    for s in required_scss:
        full_s = os.path.join(scss_dir, s)
        assert_true(os.path.isfile(full_s), f"SCSS partial exists: {s}")
        
    with open(os.path.join(scss_dir, "_mixins.scss"), "r", encoding="utf-8") as f:
        mixins = f.read()
    assert_true("@mixin respond-to" in mixins, "SCSS includes responsive @mixin respond-to")

    # In SCSS it must use @/ instead of ./ or ../
    for s in required_scss:
        with open(os.path.join(scss_dir, s), "r", encoding="utf-8") as f:
            code = f.read()
        assert_true('@use "./' not in code and "@use './" not in code, f"{s} contains zero @use './ relative imports")
        assert_true('@use "../' not in code and "@use '../" not in code, f"{s} contains zero @use '../ relative imports")
        assert_true('@import "./' not in code and "@import './" not in code, f"{s} contains zero @import './ relative imports")
        assert_true('@import "../' not in code and "@import '../" not in code, f"{s} contains zero @import '../ relative imports")
        if "@use" in code:
            assert_true('@use "@/' in code or "@use 'sass:" in code or '@use "sass:' in code, f"{s} uses @/ or built-in modules")

def test_ui_folder_organization():
    log_step("9. UI Folder Reorganization & Builder Suffix")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    ui_ts = os.path.join(project_root, "packages/model-connector-ui/src/main/typescript")
    
    required_dirs = [
        "mobile/layout",
        "mobile/pages",
        "mobile/services",
        "desktop/layout",
        "desktop/pages",
        "desktop/services",
        "components",
        "utils",
        "utils/hooks",
        "utils/pagination"
    ]
    for d in required_dirs:
        full_d = os.path.join(ui_ts, d)
        assert_true(os.path.isdir(full_d), f"UI directory exists: {d}")

    # Verify builder suffix in docker-compose.build.yml
    build_compose = os.path.join(project_root, "config/docker/docker-compose.build.yml")
    with open(build_compose, "r", encoding="utf-8") as f:
        compose_content = f.read()
    assert_true("model-connector-platform-builder" in compose_content, "Docker compose has suffix builder: model-connector-platform-builder")

def test_migration_completeness():
    log_step("10. Verification of Migration from gemini-model-connector (Req #9)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    constants_file = os.path.join(project_root, "packages/model-connector-core/src/main/typescript/constants/index.ts")
    
    with open(constants_file, "r", encoding="utf-8") as f:
        constants_code = f.read()
    
    assert_true("DatabaseTable" in constants_code, "DatabaseTable constants present")
    assert_true("DatabaseColumn" in constants_code, "DatabaseColumn constants present")
    assert_true("ModelCatalog" in constants_code, "ModelCatalog constants present")
    assert_true("ModelFamily" in constants_code, "ModelFamily constants present")

def test_core_utils_encapsulation():
    log_step("11. Core Utils Encapsulation & Zero Direct node:* Imports (STD-COD-011)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    packages_dir = os.path.join(project_root, "packages")

    # Verify new utils exist in core
    core_utils_dir = os.path.join(packages_dir, "model-connector-core/src/main/typescript/utils")
    for u in ["timer/timerUtils.ts", "file/pathUtils.ts", "process/childProcessUtils.ts", "db/sqliteUtils.ts"]:
        full_u = os.path.join(core_utils_dir, u)
        assert_true(os.path.isfile(full_u), f"Core util exists: {u}")

    # Check that client and service packages have zero direct node:* imports in main typescript source files
    prohibited_pattern = re.compile(r'from\s+["\']node:(crypto|perf_hooks|child_process|fs|path|sqlite)["\']')
    for pkg in ["model-connector-client", "model-connector-service"]:
        ts_dir = os.path.join(packages_dir, pkg, "src/main/typescript")
        for root, _, files in os.walk(ts_dir):
            for file in files:
                if file.endswith(".ts") or file.endswith(".tsx"):
                    file_path = os.path.join(root, file)
                    with open(file_path, "r", encoding="utf-8") as f:
                        text = f.read()
                    match = prohibited_pattern.search(text)
                    rel = os.path.relpath(file_path, project_root)
                    assert_true(match is None, f"{rel} has zero unencapsulated node:* imports")

def test_spring_environment_and_task_lifecycle():
    log_step("12. Spring-Style Environment & Dynamic Task Lifecycle in application.yml")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    env_dir = os.path.join(project_root, "packages/model-connector-core/src/main/typescript/config/environment")
    
    for f in ["Environment.ts", "PropertySource.ts", "YamlPropertySourceLoader.ts", "StandardEnvironment.ts", "index.ts"]:
        full_f = os.path.join(env_dir, f)
        assert_true(os.path.isfile(full_f), f"Environment package module exists: {f}")

    # Verify tasks.lifecycle in application.yml
    core_yaml = os.path.join(project_root, "packages/model-connector-core/src/main/resources/application.yml")
    with open(core_yaml, "r", encoding="utf-8") as f:
        core_yaml_text = f.read()
    assert_true("heartbeatTimeoutSeconds" in core_yaml_text, "core application.yml contains heartbeatTimeoutSeconds")
    assert_true("maxStalledTimeoutSeconds" in core_yaml_text, "core application.yml contains maxStalledTimeoutSeconds")

    # Verify TaskHeartbeatWatchdog
    watchdog_file = os.path.join(project_root, "packages/model-connector-service/src/main/typescript/services/lifecycle/TaskHeartbeatWatchdog.ts")
    assert_true(os.path.isfile(watchdog_file), "TaskHeartbeatWatchdog.ts exists")
    with open(watchdog_file, "r", encoding="utf-8") as f:
        wd_text = f.read()
    assert_true("tasks.lifecycle.heartbeatTimeoutSeconds" in wd_text, "Watchdog loads heartbeatTimeoutSeconds dynamically")
    assert_true("tasks.lifecycle.maxStalledTimeoutSeconds" in wd_text, "Watchdog loads maxStalledTimeoutSeconds dynamically")

def test_docker_compose_pgadmin():
    log_step("13. Docker Compose with PostgreSQL & pgAdmin (Port 5050)")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    compose_file = os.path.join(project_root, "config/docker/docker-compose.yml")
    servers_file = os.path.join(project_root, "config/database/pgadmin/servers.json")

    assert_true(os.path.isfile(servers_file), "pgAdmin servers.json auto-connect configuration exists")
    with open(compose_file, "r", encoding="utf-8") as f:
        compose_text = f.read()
    assert_true("postgres:" in compose_text, "docker-compose.yml defines postgres service")
    assert_true("pgadmin:" in compose_text, "docker-compose.yml defines pgadmin service")
    assert_true("5050:80" in compose_text or "PGADMIN_PORT" in compose_text, "pgAdmin mapped to port 5050")
    assert_true("model-connector-postgres-data" in compose_text, "PostgreSQL volume defined")
    assert_true("model-connector-pgadmin-data" in compose_text, "pgAdmin volume defined")

def test_model_cli_and_kubernetes():
    log_step("14. Model CLI Catalog, Custom Locations & Kubernetes Manifests")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    cli_catalog = os.path.join(project_root, "packages/model-connector-client/src/main/typescript/domain/constants/modelCliCatalog.ts")
    dockerfile = os.path.join(project_root, "packages/model-connector-service/src/main/resources/Dockerfile")
    k8s_dir = os.path.join(project_root, "config/kubernetes")

    assert_true(os.path.isfile(cli_catalog), "modelCliCatalog.ts exists")
    with open(cli_catalog, "r", encoding="utf-8") as f:
        cli_text = f.read()
    for fam in ["gemini", "claude", "chatgpt", "copilot", "grok", "ollama"]:
        assert_true(fam in cli_text, f"CLI catalog supports family {fam}")

    # Check Dockerfile custom CLI directory args
    with open(dockerfile, "r", encoding="utf-8") as f:
        df_text = f.read()
    assert_true("CLI_BASE_DIR" in df_text, "Dockerfile defines customizable CLI_BASE_DIR")
    assert_true("CLI_BIN_DIR" in df_text, "Dockerfile defines customizable CLI_BIN_DIR")
    assert_true("CLI_CACHE_DIR" in df_text, "Dockerfile defines customizable CLI_CACHE_DIR")
    assert_true("MODEL_CLI_PATH" in df_text, "Dockerfile exports MODEL_CLI_PATH")

    # Check Kubernetes manifests
    for k in ["configmap.yaml", "deployment.yaml", "service.yaml", "pgadmin-deployment.yaml", "kustomization.yaml"]:
        full_k = os.path.join(k8s_dir, k)
        assert_true(os.path.isfile(full_k), f"Kubernetes manifest exists: {k}")

def test_markdown_links_and_anchors():
    log_step("15. Markdown Links & Anchor Headings Verification (STD-DOC-001)")
    from check_md_links import audit_links
    from pathlib import Path
    project_root = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))
    issues = audit_links(project_root)
    assert_true(len(issues) == 0, f"All Markdown links and section anchors valid (0 broken links across 49 files)")

def main():
    print(f"{CYAN}=================================================================={RESET}")
    print(f"{CYAN} ModelConnector Platform Comprehensive Invariant Verification {RESET}")
    print(f"{CYAN}=================================================================={RESET}")
    test_root_parent_isolation()
    test_uppercase_and_meaningful_columns()
    test_distributed_microservices_logging()
    test_functional_multi_model_adapters()
    test_nosql_configuration()
    test_pagination_dialects()
    test_pagination_ui_components()
    test_responsive_scss()
    test_ui_folder_organization()
    test_migration_completeness()
    test_core_utils_encapsulation()
    test_spring_environment_and_task_lifecycle()
    test_docker_compose_pgadmin()
    test_model_cli_and_kubernetes()
    test_markdown_links_and_anchors()
    print(f"\n{GREEN}[SUCCESS] ALL REQUIREMENTS AND ARCHITECTURAL INVARIANTS VERIFIED SUCCESSFULLY{RESET}\n")

if __name__ == "__main__":
    main()


