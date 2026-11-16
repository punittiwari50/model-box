# @model-box/model-connector-service

Enterprise Express REST & SSE service exposing model connectivity to the UI, built on top of `@model-box/model-connector-client`.

## Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service and upstream Gemini Connector health |
| `GET` | `/api/v1/models` | Discovered models catalog with strategy capabilities |
| `GET` | `/api/v1/models/:id` | Specific model metadata and hyperparameters |
| `POST` | `/api/v1/chat` | Synchronous inference across CLI, API, or Cookie strategy |
| `POST` | `/api/v1/chat/stream` | Server-Sent Events (SSE) streaming token inference |
| `GET` | `/api/v1/sessions` | Active multi-turn sessions and cookie lineage list |
| `GET` | `/api/v1/sessions/:id` | Specific session details and cookie jar contents |
| `GET` | `/api/v1/upstream/status` | Live upstream authentication and connectivity status |
| `GET` | `/api/v1/upstream/audit` | Upstream compliance audit trail records |

## Running Locally

```bash
npm run dev
```
