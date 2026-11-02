# @model-box/model-connector-client

Enterprise omni-channel client library implementing AI model connectivity via:
1. **Headless CLI Strategy**: Spawns `@google/gemini-cli`, `ollama`, or custom CLIs with robust streaming and process lifecycle management.
2. **REST API Strategy**: High-performance HTTP/REST connector with header authorization and streaming chunk processing.
3. **Cookie / Session Lineage Strategy**: Cookie Jar injection, stateful conversation turn lineage, and session rotation.
4. **Unified Upstream Model Execution Adapter**: Synchronizes multi-family models, authentication state, and audit logs from upstream model services.

## Usage Example

```typescript
import { ClientFactory, ExecutionStrategyType } from "@model-box/model-connector-client";

const client = ClientFactory.create({
  defaultStrategy: ExecutionStrategyType.API,
  upstreamUrl: "http://127.0.0.1:8090",
});

// Discover verified models from upstream
const models = await client.getModels();

// Execute prompt via chosen strategy
const response = await client.execute({
  prompt: "Summarize the latest developments in generative AI.",
  model: "gemini-3.8-flash",
  strategy: ExecutionStrategyType.CLI,
});

console.log(response.content);
```
