# Gemini CLI — Extensions & Model Context Protocol (MCP)

## 1. Overview

Gemini CLI integrates directly with the **Model Context Protocol (MCP)**, an open industry standard that connects large language model applications with external tools, contextual data sources, and services. Through MCP, Gemini CLI can query live databases, inspect internal microservices, execute build systems, and interface with IDE ecosystems securely.

---

## 2. MCP Server Configuration

MCP servers are registered in the project or global configuration file (`.gemini/mcp_config.json` or `~/.gemini/mcp_config.json`).

### Configuration Schema
```json
{
  "mcpServers": {
    "postgres-inspector": {
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "model-connector-postgres",
        "psql",
        "-U",
        "postgres",
        "-d",
        "model_connector_db"
      ],
      "env": {
        "PGPASSWORD": "adminpassword"
      }
    },
    "model-box-node-service": {
      "command": "node",
      "args": ["packages/model-connector-service/dist/mcp-server.js"],
      "env": {
        "PORT": "8095"
      }
    }
  }
}
```

---

## 3. Protocol Lifecycle

1. **Discovery & Handshake**: On startup, Gemini CLI launches configured MCP server processes via stdio or SSE (Server-Sent Events) and issues `initialize` and `tools/list` requests.
2. **Schema Ingestion**: Tool definitions (names, parameters, JSON Schema validation) are compiled into the Gemini Model's function declaration format (`ToolDeclaration`).
3. **Execution Routing**: When the model issues a tool call matching an MCP server's namespace, the CLI routes the arguments to that server and relays the result back to the model context.

---

## 4. Extension Packaging

In addition to standalone MCP servers, Gemini CLI supports bundled **Extensions**:
- Bundles packaged with skills, MCP definitions, and custom prompt templates.
- Installed via `gemini extension install <package-name-or-git-url>`.
- Version pinned and audited against supply-chain vulnerabilities.
