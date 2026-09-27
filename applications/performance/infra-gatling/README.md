# Infra Gatling Performance Harness

This performance harness targets the Ollama runtime defined in the Compose stack at `infra/ollama/docker/compose.ollama.yaml`.

## Architecture

### Modular Configuration System

The harness uses a **generalized, reusable configuration system** designed for multi-model environments:

- **`com.modelbox.config.ConfigLoader`** - Generic configuration loader (separate package for reuse)
  - Loads YAML and properties files
  - Supports environment profiles via `APP_PROFILE` env var
  - Priority: defaults → profile-specific → system properties

- **`com.modelbox.config.ollama.OllamaConfig`** - Ollama-specific config wrapper
  - Centralizes Ollama property names and defaults
  - Used by Ollama simulations

- **`com.modelbox.gatling.GatlingConfig`** - Gatling-specific config wrapper
  - Centralizes Gatling load test property names and defaults
  - Shared across all Gatling simulations

All configuration values are defined as **constants in the config classes** and loaded from **environment-specific YAML/properties files** in `modules/infra-gatling-scala/src/test/resources/`.

## Configuration System

Manual-first execution policy:

1. Run all performance steps directly from terminal commands in this document.
2. Do not depend on assistant or token-based workflows for setup, execution, or report collection.

The harness uses **environment-specific configuration files** (properties and YAML) for flexible runtime setup:

### Default Configuration (Local)

**File:** `modules/infra-gatling-scala/src/test/resources/application.yml`

```yaml
ollama:
  baseUrl: http://127.0.0.1:11435
  model: auto
  timeout: 60
  retries: 3

gatling:
  warmupUsers: 5
  maxUsers: 20
  rampDuration: 30
  holdDuration: 300
  thinkTime: 1000
  timeout: 30
  requestPause: 500
  profile.load.warmupUsers: 5
  profile.load.maxUsers: 20
  profile.load.rampDuration: 30
  profile.load.holdDuration: 120
  profile.stress.warmupUsers: 8
  profile.stress.maxUsers: 40
  profile.stress.rampDuration: 60
  profile.stress.holdDuration: 90
  profile.soak.warmupUsers: 5
  profile.soak.maxUsers: 16
  profile.soak.rampDuration: 45
  profile.soak.holdDuration: 1800
  profile.spike.warmupUsers: 5
  profile.spike.maxUsers: 60
  profile.spike.rampDuration: 10
  profile.spike.holdDuration: 20
```

Set the `APP_PROFILE` environment variable to load profile-specific configuration.

### Environment-Specific Profiles

Create and override profiles by setting the `APP_PROFILE` environment variable:

- **local** (default): `application.yml` or `application.properties`
- **dev**: `application-dev.yml` → Dev Ollama instance
- **prod**: `application-prod.yml` → Production Ollama instance
- **test**: `application-test.yml` → Light-weight smoke test

Runtime/module selection profile (default is Java):

- `APP_PROFILE=local` (or `dev/prod/test`) runs the **Java** Gatling module.
- `APP_PROFILE=scala-local` (or `scala-dev`, `scala-prod`, `scala-test`) runs the **Scala** Gatling module while still loading the corresponding profile file.
- `APP_PROFILE=java-local` explicitly pins Java module execution.

Configuration load order (later overrides earlier):
1. `application.yml` / `application.properties`
2. `application-{profile}.yml` / `application-{profile}.properties`
3. System properties (highest priority)

### Run with Maven

**Local (default, JDK27, multi-module via Scala module POM):**

```bash
cd applications/performance/infra-gatling
mvn -pl modules/infra-gatling-scala -am gatling:test
```

**Optional JDK21 compatibility override:**

```bash
mvn -pl modules/infra-gatling-scala -am -Dmaven.compiler.source=21 -Dmaven.compiler.target=21 gatling:test
```

**With specific profile:**

```bash
mvn -pl modules/infra-gatling-scala -am gatling:test -DAPP_PROFILE=dev
```

**Override via system property:**

```bash
mvn -pl modules/infra-gatling-scala -am gatling:test -Dollama.baseUrl=http://custom.host:11435
```

### Run with Gradle

**Local (default, JDK27 via build.gradle.kts):**

```bash
cd applications/performance/infra-gatling
gradle gatlingRun
```

**JDK21 compatibility (suffix Gradle file):**

```bash
gradle -b build-jdk21.gradle.kts gatlingRun
```

**With specific profile:**

```bash
APP_PROFILE=dev gradle gatlingRun
```

**Override via environment variable:**

```bash
APP_PROFILE=prod gradle gatlingRun
```

## Manual run workflow (end to end)

Use this sequence to run the full performance workflow manually:

```bash
# 1) Start runtime stack
docker compose -f infra/ollama/docker/compose.ollama.yaml up -d --build

# 2) Ensure at least one model is present
docker exec ollama-model-service ollama list
docker exec ollama-model-service ollama pull tinyllama:latest

# 3) Start performance stack
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d --build

# 4) Watch Gatling execution
docker logs -f gatling-service

# 5) Open latest report index
# Linux/macOS:
xdg-open http://localhost:8080/
# Windows PowerShell:
Start-Process http://localhost:8080/
```

### Named smoke pipeline command

Use the helper script when you want the smoke load and stress checks as a single named command:

```bash
cd applications/performance/infra-gatling
bash ./config/infra-iac/scripts/smoke-pipeline.sh
powershell -ExecutionPolicy Bypass -File ./smoke-pipeline.ps1
```

The smoke pipeline discovers the Ollama models already available in the container, runs the load and stress scenarios for each discovered model, and publishes a tabular HTML summary under `/reports/smoke-summary.html`.

## JDK 27 default quality profile for Gatling

Use JDK 27 diagnostics and memory controls to improve test quality and reproducibility.

Recommended Java options for performance runs:

```bash
export GATLING_JVM_ARGS="-XX:+UseZGC -XX:+ZGenerational -XX:MaxRAMPercentage=75 -XX:StartFlightRecording=filename=/reports/jfr/gatling.jfr,settings=profile,maxsize=128m,dumponexit=true"
```

PowerShell equivalent:

```powershell
$env:GATLING_JVM_ARGS='-XX:+UseZGC -XX:+ZGenerational -XX:MaxRAMPercentage=75 -XX:StartFlightRecording=filename=/reports/jfr/gatling.jfr,settings=profile,maxsize=128m,dumponexit=true'
```

Notes:

1. `UseZGC` and `ZGenerational` help reduce GC pause bias during load tests.
2. JFR (`StartFlightRecording`) captures method, allocation, and GC evidence for post-run analysis.
3. Store JFR output under the report volume so artifacts remain available after container restart.

## Configuration Properties

### Ollama Properties

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `ollama.baseUrl` | String | `http://127.0.0.1:11435` | Ollama API endpoint |
| `ollama.model` | String | `auto` | Model hint used by the resolver when the runtime should discover the available tag |
| `ollama.timeout` | Int | `60` | Request timeout in seconds |
| `ollama.retries` | Int | `3` | Number of retry attempts |

### Gatling Properties

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `gatling.warmupUsers` | Int | `5` | Number of users for warmup phase |
| `gatling.maxUsers` | Int | `20` | Maximum concurrent users |
| `gatling.rampDuration` | Int | `30` | Ramp-up duration in seconds |
| `gatling.holdDuration` | Int | `300` | Sustain duration in seconds |
| `gatling.thinkTime` | Int | `1000` | Think time between requests (ms) |
| `gatling.timeout` | Int | `30` | HTTP request timeout (seconds) |
| `gatling.requestPause` | Int | `500` | Pause between requests (ms) |

### Performance Profile Keys

Each performance test type is driven by profile-scoped keys. The simulation classes map to these profile names:

- `com.modelbox.simulation.ollama.OllamaLoadSimulation` -> `load`
- `com.modelbox.simulation.ollama.OllamaStressSimulation` -> `stress`
- `com.modelbox.simulation.ollama.OllamaSoakSimulation` -> `soak`
- `com.modelbox.simulation.ollama.OllamaSpikeSimulation` -> `spike`

For each profile, configure:

- `gatling.profile.<type>.warmupUsers`
- `gatling.profile.<type>.maxUsers`
- `gatling.profile.<type>.rampDuration`
- `gatling.profile.<type>.holdDuration`
- `gatling.profile.<type>.thinkTime`
- `gatling.profile.<type>.requestPause`

- The `ConfigLoader` is in a separate `com.modelbox.config` package so it can be reused across different model integrations.
- All property names are defined as constants in `OllamaConfig` and `GatlingConfig` for type-safety.

### Model Discovery

When `ollama.model=auto`, the harness queries `/api/tags` and uses the first available model tag for the run. That keeps the test configuration model-agnostic while still binding the run to the model that is actually installed in the runtime.

Multiple simulations can be run together by setting `GATLING_SIMULATIONS` to a comma-separated list. If it is not set, the harness falls back to `GATLING_SIMULATION`.

Default multi-simulation execution list:

```text
com.modelbox.simulation.ollama.OllamaLoadSimulation,
com.modelbox.simulation.ollama.OllamaStressSimulation,
com.modelbox.simulation.ollama.OllamaSoakSimulation,
com.modelbox.simulation.ollama.OllamaSpikeSimulation
```

Each simulation run is archived separately under `/reports/runs/<timestamp>_<simulation-class>/` with its own Gatling HTML report and metadata.

For a current install-versus-online snapshot, see [Ollama endpoints and use cases](../../docs/ollama-endpoints.md#4-version-snapshot).
For RTX 5080/5090 fit guidance, see [Ollama endpoints and use cases](../../docs/ollama-endpoints.md#5-rtx-support-snapshot).

## Test Scenarios

The simulation validates:

- **Tags endpoint** (`GET /api/tags`): List available models
- **Generate endpoint** (`POST /api/generate`): Test model inference with configured model

## Why Run It

- Load testing verifies that the Ollama-backed workflow meets expected response and throughput targets before release.
- Stress testing identifies the point where the service starts rejecting work or slowing down unacceptably.
- Soak testing helps surface leaks or gradual degradation across long runs.
- Spike testing checks how the service behaves during short traffic bursts.

## Mandatory Or Optional

- It is not mandatory for every local change.
- It is recommended, and often mandatory in release validation, for changes that affect the Ollama runtime, request handling, concurrency, or latency-sensitive code paths.
- For pure documentation changes or low-risk refactors, it is usually optional.

## Security And Attack Prevention

- Performance testing can show how close the service is to overload, but it does not stop attacks.
- If you need attack prevention, use authentication, rate limiting, network controls, and strict host exposure rules.
- Keep Ollama bound to localhost or a trusted private network whenever possible.
- Use the performance harness to observe resilience, not as a security boundary.

## Notes

- For the default load profile, the harness checks the model listing endpoint to confirm the runtime is healthy.
- For generation checks, the runner resolves the available model before starting and passes the discovered tag into the performance test.
- Environment-specific configs support both **properties** and **YAML** formats (YAML preferred).

## Runtime user policy

- Services must run as non-root users.
- `gatling-service` runs as `1500:1500`.
- `report-service` runs as `10002:10002`.
- Root runtime (`0:0`) is not allowed for normal execution.

## Performance Test Types

See [performance testing guidance](docs/PERFORMANCE_TESTING.md) for load, stress, soak, and spike definitions.
