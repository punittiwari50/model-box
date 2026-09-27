# Performance Testing Guide

## Purpose

Performance testing is used to measure how the system behaves under real or simulated usage patterns before users experience failures in production. It answers four questions:

- Can the system handle the expected traffic?
- Where is the breaking point?
- How does the system behave when it is overloaded?
- Does the service recover cleanly after pressure is removed?

The main outcome is evidence: response time, throughput, error rate, and resource consumption become measurable instead of assumed.

## When To Run It

- Run load testing before release, after major changes, and after scaling or configuration changes.
- Run stress testing when you need to understand failure limits, capacity headroom, or recovery behavior.
- Run soak testing when you want to find leaks or degradation over time.
- Run spike testing when you want to verify short burst handling.

Performance testing is not mandatory for every local code change, but it is strongly recommended for user-facing or latency-sensitive changes and should be part of release validation for critical paths.

## Load Testing

Load testing checks whether the system behaves correctly at the expected level of traffic. Use it to verify response times, throughput, and error rates under normal or projected production usage.

## Stress Testing

Stress testing pushes the system beyond the expected load to find the breaking point, observe failure modes, and confirm that the service degrades predictably instead of failing unpredictably.

## Soak Testing

Soak testing runs the system for a long period at a steady load to surface memory leaks, resource exhaustion, and slow degradation over time.

## Spike Testing

Spike testing applies sudden traffic bursts to understand how the system reacts to abrupt demand changes.

## How This Harness Uses Them

- The harness provides dedicated simulations for each test type:
	- `com.modelbox.simulation.ollama.OllamaLoadSimulation`
	- `com.modelbox.simulation.ollama.OllamaStressSimulation`
	- `com.modelbox.simulation.ollama.OllamaSoakSimulation`
	- `com.modelbox.simulation.ollama.OllamaSpikeSimulation`
- Runtime behavior is configuration-driven via `gatling.profile.<type>.*` keys in `application*.yml`.
- Java module execution is the default runtime path; use `APP_PROFILE=scala-<profile>` to execute Scala simulations.
- The runner resolves the available Ollama model at startup so the selected test type uses the real model already present in the runtime.
- Each simulation execution is archived into its own report folder under `/reports/runs/<timestamp>_<simulation-class>/`.

## Manual Execution Requirement

- Run tests from explicit shell commands and Compose operations.
- Keep execution and report steps terminal-driven so results are reproducible without assistant-specific tooling.

## JDK 27 Default Quality Features For Gatling

Use JDK 27 runtime features during performance tests to increase result quality:

- `-XX:+UseZGC` and `-XX:+ZGenerational` for lower and more stable GC pause impact.
- `-XX:MaxRAMPercentage=75` to keep memory behavior predictable in containers.
- `-XX:StartFlightRecording=filename=/reports/jfr/gatling.jfr,settings=profile,maxsize=128m,dumponexit=true` to produce post-run evidence (JFR) for flame and GC analysis.

These options are configured through `GATLING_JVM_ARGS` in [infra/performance/infra-gatling/docker/.env](../../../../infra/performance/infra-gatling/docker/.env).

For compatibility runs, use module-targeted build commands:

- Maven (JDK27 default): `mvn -f applications/performance/infra-gatling/pom.xml -pl modules/infra-gatling-scala -am gatling:test`
- Maven (JDK21 override): `mvn -f applications/performance/infra-gatling/pom.xml -pl modules/infra-gatling-scala -am -Dmaven.compiler.source=21 -Dmaven.compiler.target=21 gatling:test`
- Gradle: `gradle -b applications/performance/infra-gatling/build-jdk21.gradle.kts gatlingRun`

## What Is Achieved

- Load testing confirms the service meets expected service levels.
- Stress testing shows the maximum safe operating point and failure mode.
- Soak testing reveals memory leaks and slow resource buildup.
- Spike testing validates burst tolerance and queueing behavior.
- Per-simulation report isolation allows side-by-side comparison of each test type without report overwrites.

## Attack Prevention

Performance testing does not prevent attacks by itself. It helps you estimate how the service behaves under abuse-like traffic, including denial-of-service style pressure, but real prevention must come from defensive controls:

- Authenticate and authorize access to protected endpoints.
- Add rate limits and request quotas.
- Use network restrictions, reverse proxies, or firewalls to limit exposure.
- Keep the Ollama service bound to localhost or a trusted network only.
- Validate and cap request size, timeout, and concurrency.
- Monitor logs and metrics for request spikes, error bursts, and unusual source patterns.

If your question is whether performance testing is enough to stop attacks, the answer is no. It is useful for resilience testing, not for prevention.
