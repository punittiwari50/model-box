#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

gatling::timestamp() {
  date -u +%Y-%m-%dT%H-%M-%SZ
}

gatling::log() {
  printf '[gatling:%s] %s\n' "${GATLING_MODULE_LABEL}" "$*"
}

gatling::fail() {
  printf '[gatling:%s] %s\n' "${GATLING_MODULE_LABEL}" "$*" >&2
  exit 1
}

gatling::sanitize_tag() {
  printf '%s' "$1" | tr '/: ' '___' | tr -cd '[:alnum:]._-' | sed 's/__*/_/g; s/^_//; s/_$//'
}

gatling::normalize_jvm_args() {
  local raw="${1:-}"
  local normalized=""
  local token
  local -a tokens

  raw="$(printf '%s' "${raw}" | tr ',' ' ' | xargs)"
  IFS=' ' read -r -a tokens <<< "${raw}"
  for token in "${tokens[@]}"; do
    case "${token}" in
      -XX:+ZGenerational)
        # This flag is not available on all JDK builds; skip to keep runs portable.
        continue
        ;;
      -XX:StartFlightRecording=*)
        # This option includes commas and breaks when passed through gatling.jvmArgs as comma-delimited args.
        continue
        ;;
      settings=*|maxsize=*|dumponexit=*)
        # Drop trailing fragments originating from StartFlightRecording comma-separated sub-options.
        continue
        ;;
    esac

    if [[ -z "${normalized}" ]]; then
      normalized="${token}"
    else
      normalized="${normalized},${token}"
    fi
  done

  printf '%s' "${normalized}"
}

gatling::first_remote_model() {
  local tags_url="${GATLING_OLLAMA_URL}/api/tags"
  local body

  body="$(curl -fsS --max-time 20 "${tags_url}" 2>/dev/null || true)"
  if [[ -z "${body}" ]]; then
    printf ''
    return 0
  fi

  printf '%s' "${body}" | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

gatling::ensure_model_ready() {
  local configured_model="${GATLING_MODEL:-auto}"
  local discovered=""

  if [[ "${configured_model}" != "" && "${configured_model}" != "auto" ]]; then
    gatling::log "Using explicit model=${configured_model}"
    return 0
  fi

  discovered="$(gatling::first_remote_model)"
  if [[ -n "${discovered}" ]]; then
    gatling::log "Resolved model from Ollama tags: ${discovered}"
    return 0
  fi

  gatling::fail "No Ollama models available at ${GATLING_OLLAMA_URL}/api/tags. Ensure Ollama has at least one pulled model before running tests."
}

gatling::resolve_runtime() {
  local runtime_profile="${GATLING_RUNTIME_PROFILE:-java}"
  local app_profile="${APP_PROFILE:-local}"

  if [[ "${app_profile}" == scala-* ]]; then
    runtime_profile="scala"
    app_profile="${app_profile#scala-}"
  elif [[ "${app_profile}" == java-* ]]; then
    runtime_profile="java"
    app_profile="${app_profile#java-}"
  fi

  GATLING_RUNTIME_PROFILE="${runtime_profile}"
  GATLING_ACTIVE_APP_PROFILE="${app_profile}"

  case "${GATLING_RUNTIME_PROFILE}" in
    java)
      GATLING_MODULE_PATH="modules/infra-gatling-java"
      GATLING_MODULE_LABEL="infra-gatling-java"
      GATLING_DEFAULT_SIMS="com.modelbox.simulation.ollama.OllamaJavaLoadSimulation,com.modelbox.simulation.ollama.OllamaJavaStressSimulation,com.modelbox.simulation.ollama.OllamaJavaSoakSimulation,com.modelbox.simulation.ollama.OllamaJavaSpikeSimulation"
      ;;
    scala)
      GATLING_MODULE_PATH="modules/infra-gatling-scala"
      GATLING_MODULE_LABEL="infra-gatling-scala"
      GATLING_DEFAULT_SIMS="com.modelbox.simulation.ollama.OllamaLoadSimulation,com.modelbox.simulation.ollama.OllamaStressSimulation,com.modelbox.simulation.ollama.OllamaSoakSimulation,com.modelbox.simulation.ollama.OllamaSpikeSimulation"
      ;;
    *)
      gatling::fail "Unsupported GATLING_RUNTIME_PROFILE='${GATLING_RUNTIME_PROFILE}'. Use 'java' or 'scala'."
      ;;
  esac

  GATLING_REPORT_ROOT="${REPORTS_DIR:-/reports}"
  GATLING_MODEL="${OLLAMA_MODEL:-}"
  GATLING_SIMULATIONS="${GATLING_SIMULATIONS:-${GATLING_DEFAULT_SIMS}}"
  GATLING_MAX_USERS="${GATLING_MAX_USERS:-20}"
  GATLING_WARMUP_USERS="${GATLING_WARMUP_USERS:-5}"
  GATLING_JVM_ARGS="${GATLING_JVM_ARGS:--XX:+UseZGC -XX:+ZGenerational -XX:MaxRAMPercentage=70 -XX:+UseStringDeduplication -Djdk.virtualThreadScheduler.parallelism=8 -XX:StartFlightRecording=filename=/reports/jfr/gatling.jfr,settings=profile,maxsize=128m,dumponexit=true}"
  GATLING_MAVEN_REPO_PATH="${MAVEN_REPO_CONTAINER_PATH:-/home/modelbox/.m2/repository}"
  GATLING_OLLAMA_URL="${OLLAMA_BASE_URL:-http://ollama-model-service:11434}"

  export MAVEN_OPTS="${MAVEN_OPTS:-} --sun-misc-unsafe-memory-access=allow"
}

gatling::prepare() {
  mkdir -p "${GATLING_REPORT_ROOT}/runs" "${GATLING_REPORT_ROOT}/jfr"

  # gatling-maven-plugin expects JVM args in comma-separated format when provided via system property.
  GATLING_JVM_ARGS="$(gatling::normalize_jvm_args "${GATLING_JVM_ARGS}")"

  gatling::log "Selected runtimeProfile=${GATLING_RUNTIME_PROFILE}, appProfile=${GATLING_ACTIVE_APP_PROFILE}, modulePath=${GATLING_MODULE_PATH}, model=${GATLING_MODEL:-auto}"

  # Run gatling:test from module POM to avoid executing plugin on the parent aggregator POM.
  GATLING_MODULE_POM="${GATLING_MODULE_PATH}/pom.xml"
  if [[ ! -f "${GATLING_MODULE_POM}" ]]; then
    gatling::fail "Module POM not found at ${GATLING_MODULE_POM}"
  fi

  if [[ "${GATLING_RUNTIME_PROFILE}" == "scala" ]]; then
    gatling::log "Preparing scala runtime by installing shared java module"
    mvn -B -ntp \
      -f "modules/infra-gatling-java/pom.xml" \
      -Dmaven.repo.local="${GATLING_MAVEN_REPO_PATH}" \
      -DskipTests \
      install
  fi
}

gatling::run_simulation() {
  local simulation_class="$1"
  local model_tag="${GATLING_MODEL:-auto}"
  local model_slug="$(gatling::sanitize_tag "${model_tag}")"
  local simulation_slug="$(gatling::sanitize_tag "${simulation_class}")"
  local timestamp="$(gatling::timestamp)"
  local output_dir="${GATLING_REPORT_ROOT}/runs/${timestamp}~${model_slug}~${simulation_slug}"
  local latest_run=""

  gatling::log "Running simulation=${simulation_class} model=${model_tag}"

  mvn -B -ntp \
    -f "${GATLING_MODULE_POM}" \
    -Dmaven.repo.local="${GATLING_MAVEN_REPO_PATH}" \
    -Dgatling.jvmArgs="${GATLING_JVM_ARGS}" \
    -Dapp.profile="${GATLING_ACTIVE_APP_PROFILE}" \
    -Dollama.baseUrl="${GATLING_OLLAMA_URL}" \
    -Dollama.model="${model_tag}" \
    -Dgatling.maxUsers="${GATLING_MAX_USERS}" \
    -Dgatling.warmupUsers="${GATLING_WARMUP_USERS}" \
    -Dgatling.simulationClass="${simulation_class}" \
    gatling:test

  latest_run="$(find "${GATLING_MODULE_PATH}/target/gatling" -mindepth 1 -maxdepth 1 -type d | sort -r | head -n 1 || true)"
  if [[ -n "${latest_run}" ]]; then
    mkdir -p "${output_dir}"
    cp -R "${latest_run}/." "${output_dir}/"
  fi
}

gatling::write_index() {
  local index_file="${GATLING_REPORT_ROOT}/index.html"

  cat > "${index_file}" <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Gatling Reports</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; background: #f7f7fb; color: #1f2937; }
    table { border-collapse: collapse; width: 100%; background: #fff; }
    th, td { border: 1px solid #d1d5db; padding: 0.65rem; text-align: left; }
    th { background: #111827; color: #fff; }
    tr:nth-child(even) { background: #f9fafb; }
    a { color: #0f62fe; }
  </style>
</head>
<body>
  <h1>Gatling Reports</h1>
  <table>
    <thead>
      <tr><th>Timestamp</th><th>Model</th><th>Simulation</th><th>Report</th></tr>
    </thead>
    <tbody>
HTML

  find "${GATLING_REPORT_ROOT}/runs" -mindepth 1 -maxdepth 1 -type d | sort -r | while IFS= read -r run_dir; do
    local run_name model_name simulation_name timestamp
    run_name="$(basename "${run_dir}")"
    timestamp="${run_name%%~*}"
    model_name="${run_name#*~}"
    model_name="${model_name%%~*}"
    simulation_name="${run_name##*~}"
    simulation_name="${simulation_name//_/\.}"
    if [[ -f "${run_dir}/index.html" ]]; then
      printf '      <tr><td>%s</td><td>%s</td><td>%s</td><td><a href="/reports/runs/%s/index.html">Open</a></td></tr>\n' \
        "${timestamp}" "${model_name}" "${simulation_name}" "${run_name}" >> "${index_file}"
    fi
  done

  cat >> "${index_file}" <<'HTML'
    </tbody>
  </table>
</body>
</html>
HTML
}

main() {
  gatling::resolve_runtime
  gatling::prepare
  gatling::ensure_model_ready

  local simulations="${GATLING_SIMULATIONS}"
  local simulation
  IFS=',' read -r -a simulation_list <<< "${simulations}"
  for simulation in "${simulation_list[@]}"; do
    [[ -n "${simulation}" ]] || continue
    gatling::run_simulation "${simulation}"
  done

  gatling::write_index
  gatling::log "Reports ready at ${GATLING_REPORT_ROOT}/index.html"
}

main "$@"