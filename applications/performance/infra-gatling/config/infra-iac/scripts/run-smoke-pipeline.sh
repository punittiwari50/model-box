#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/config/infra-iac/scripts/smoke-pipeline.sh" "$@"

log "Running smoke-level load validation"
docker compose -f "$GATLING_COMPOSE_FILE" --env-file "$GATLING_DOTENV_FILE" --env-file "$GATLING_ENV_FILE" run --rm --build gatling-service bash -lc "cd ${WORKDIR} && mvn -B -ntp -Dmaven.repo.local=/workspace/.cache/m2/repository -Dapp.profile=${PROFILE} -Dollama.baseUrl=http://ollama-model-service:11434 -Dollama.model=${MODEL} -Dgatling.profile.load.warmupUsers=1 -Dgatling.profile.load.maxUsers=2 -Dgatling.profile.load.rampDuration=3 -Dgatling.profile.load.holdDuration=6 -Dgatling.profile.load.thinkTime=100 -Dgatling.profile.load.requestPause=100 -Dgatling.simulationClass=com.modelbox.simulation.ollama.OllamaJavaLoadSimulation gatling:test"

log "Running smoke-level stress validation"
docker compose -f "$GATLING_COMPOSE_FILE" --env-file "$GATLING_DOTENV_FILE" --env-file "$GATLING_ENV_FILE" run --rm --build gatling-service bash -lc "cd ${WORKDIR} && mvn -B -ntp -Dmaven.repo.local=/workspace/.cache/m2/repository -Dapp.profile=${PROFILE} -Dollama.baseUrl=http://ollama-model-service:11434 -Dollama.model=${MODEL} -Dgatling.profile.stress.warmupUsers=1 -Dgatling.profile.stress.maxUsers=2 -Dgatling.profile.stress.rampDuration=3 -Dgatling.profile.stress.holdDuration=6 -Dgatling.profile.stress.thinkTime=100 -Dgatling.profile.stress.requestPause=100 -Dgatling.simulationClass=com.modelbox.simulation.ollama.OllamaJavaStressSimulation gatling:test"

log "Smoke pipeline completed successfully"
