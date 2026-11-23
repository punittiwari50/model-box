#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

declare -a GATLING_MODELS=()
declare -a GATLING_MVN_EXTRA_ARGS=()

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

gatling::derive_test_type() {
  local simulation_class="$1"
  local lower

  lower="$(printf '%s' "${simulation_class}" | tr '[:upper:]' '[:lower:]')"
  case "${lower}" in
    *load*)
      printf 'Load'
      ;;
    *stress*)
      printf 'Stress'
      ;;
    *soak*)
      printf 'Soak'
      ;;
    *spike*)
      printf 'Spike'
      ;;
    *)
      printf 'Unknown'
      ;;
  esac
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

gatling::list_remote_models() {
  local tags_url="${GATLING_OLLAMA_URL}/api/tags"
  local body

  body="$(curl -fsS --max-time 20 "${tags_url}" 2>/dev/null || true)"
  if [[ -z "${body}" ]]; then
    return 0
  fi

  printf '%s' "${body}" \
    | grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | sed -E 's/^"name"[[:space:]]*:[[:space:]]*"([^"]+)"$/\1/' \
    | sort -u \
    || true
}

gatling::resolve_models() {
  local configured_model="${OLLAMA_MODEL:-auto}"
  local discovered=()

  mapfile -t discovered < <(gatling::list_remote_models)
  if [[ "${#discovered[@]}" -eq 0 ]]; then
    gatling::fail "No Ollama models available at ${GATLING_OLLAMA_URL}/api/tags. Ensure Ollama has at least one pulled model before running tests."
  fi

  if [[ "${configured_model}" != "" && "${configured_model}" != "auto" && "${configured_model}" != "all" ]]; then
    gatling::log "Ignoring OLLAMA_MODEL=${configured_model}; running performance tests for all discovered models"
  fi

  GATLING_MODELS=("${discovered[@]}")
  gatling::log "Discovered ${#GATLING_MODELS[@]} model(s) for testing: ${GATLING_MODELS[*]}"
}

gatling::ensure_model_ready() {
  if [[ "${#GATLING_MODELS[@]}" -eq 0 ]]; then
    gatling::fail "Model list is empty after discovery"
  fi

  local idx=0
  while [[ "${idx}" -lt "${#GATLING_MODELS[@]}" ]]; do
    if [[ -z "${GATLING_MODELS[${idx}]}" ]]; then
      gatling::fail "Discovered an empty model tag at index ${idx}"
    fi
    idx=$((idx + 1))
  done
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
  GATLING_SIMULATIONS="${GATLING_SIMULATIONS:-${GATLING_DEFAULT_SIMS}}"
  GATLING_MAX_USERS="${GATLING_MAX_USERS:-20}"
  GATLING_WARMUP_USERS="${GATLING_WARMUP_USERS:-5}"
  GATLING_JVM_ARGS="${GATLING_JVM_ARGS:--XX:+UseZGC -XX:+ZGenerational -XX:MaxRAMPercentage=70 -XX:+UseStringDeduplication -Djdk.virtualThreadScheduler.parallelism=8 -XX:StartFlightRecording=filename=/reports/jfr/gatling.jfr,settings=profile,maxsize=128m,dumponexit=true}"
  GATLING_MAVEN_REPO_PATH="${MAVEN_REPO_CONTAINER_PATH:-/workspace/.cache/m2/repository}"
  GATLING_OLLAMA_URL="${OLLAMA_BASE_URL:-http://ollama-model-service:11434}"
  GATLING_SKIP_DEPENDENCY_CHECK="${GATLING_SKIP_DEPENDENCY_CHECK:-true}"

  GATLING_MVN_EXTRA_ARGS=()
  if [[ "${GATLING_SKIP_DEPENDENCY_CHECK}" == "true" ]]; then
    GATLING_MVN_EXTRA_ARGS+=("-Ddependency-check.skip=true" "-Dodc.skip=true")
  fi

  export MAVEN_OPTS="${MAVEN_OPTS:-} --sun-misc-unsafe-memory-access=allow"
}

gatling::prepare() {
  mkdir -p "${GATLING_REPORT_ROOT}/runs" "${GATLING_REPORT_ROOT}/jfr"

  # Ensure maven local repository directory exists and is writable by current user
  if ! mkdir -p "${GATLING_MAVEN_REPO_PATH}" 2>/dev/null || ! touch "${GATLING_MAVEN_REPO_PATH}/.write_test" 2>/dev/null; then
    gatling::log "WARNING: Cannot write to configured repo path ${GATLING_MAVEN_REPO_PATH}; falling back to /workspace/.cache/m2/repository"
    GATLING_MAVEN_REPO_PATH="/workspace/.cache/m2/repository"
    mkdir -p "${GATLING_MAVEN_REPO_PATH}"
  else
    rm -f "${GATLING_MAVEN_REPO_PATH}/.write_test"
  fi

  # gatling-maven-plugin expects JVM args in comma-separated format when provided via system property.
  GATLING_JVM_ARGS="$(gatling::normalize_jvm_args "${GATLING_JVM_ARGS}")"

  gatling::log "Selected runtimeProfile=${GATLING_RUNTIME_PROFILE}, appProfile=${GATLING_ACTIVE_APP_PROFILE}, modulePath=${GATLING_MODULE_PATH}, modelSelection=all-discovered"
  if [[ "${GATLING_SKIP_DEPENDENCY_CHECK}" == "true" ]]; then
    gatling::log "Dependency-check is skipped (GATLING_SKIP_DEPENDENCY_CHECK=true) to avoid NVD feed download delays"
  else
    gatling::log "Dependency-check is enabled (GATLING_SKIP_DEPENDENCY_CHECK=false); NVD feed download may take time"
  fi

  # Run gatling:test from module POM to avoid executing plugin on the parent aggregator POM.
  GATLING_MODULE_POM="${GATLING_MODULE_PATH}/pom.xml"
  if [[ ! -f "${GATLING_MODULE_POM}" ]]; then
    gatling::fail "Module POM not found at ${GATLING_MODULE_POM}"
  fi

  if [[ "${GATLING_RUNTIME_PROFILE}" == "scala" ]]; then
    gatling::log "Preparing scala runtime by installing parent POM and shared java module"
    mvn -B -ntp \
      -f "pom.xml" \
      -N \
      -Dmaven.repo.local="${GATLING_MAVEN_REPO_PATH}" \
      "${GATLING_MVN_EXTRA_ARGS[@]}" \
      -DskipTests \
      install

    mvn -B -ntp \
      -f "modules/infra-gatling-java/pom.xml" \
      -Dmaven.repo.local="${GATLING_MAVEN_REPO_PATH}" \
      "${GATLING_MVN_EXTRA_ARGS[@]}" \
      -DskipTests \
      install
  fi
}

gatling::run_simulation() {
  local simulation_class="$1"
  local model_tag="$2"
  local test_type="$(gatling::derive_test_type "${simulation_class}")"
  local model_slug="$(gatling::sanitize_tag "${model_tag}")"
  local simulation_slug="$(gatling::sanitize_tag "${simulation_class}")"
  local timestamp="$(gatling::timestamp)"
  local output_dir="${GATLING_REPORT_ROOT}/runs/${timestamp}~${model_slug}~${simulation_slug}"
  local latest_run=""
  local metadata_file=""
  local req_total=""
  local req_ok=""
  local req_ko=""
  local status=""

  gatling::log "[runtime=${GATLING_RUNTIME_PROFILE}] [model=${model_tag}] [test=${test_type}] [simulation=${simulation_class}] START"

  if ! mvn -B -ntp \
    -f "${GATLING_MODULE_POM}" \
    -Dmaven.repo.local="${GATLING_MAVEN_REPO_PATH}" \
    "${GATLING_MVN_EXTRA_ARGS[@]}" \
    -Dgatling.jvmArgs="${GATLING_JVM_ARGS}" \
    -Dapp.profile="${GATLING_ACTIVE_APP_PROFILE}" \
    -Dollama.baseUrl="${GATLING_OLLAMA_URL}" \
    -Dollama.model="${model_tag}" \
    -Dgatling.maxUsers="${GATLING_MAX_USERS}" \
    -Dgatling.warmupUsers="${GATLING_WARMUP_USERS}" \
    -Dgatling.simulationClass="${simulation_class}" \
    gatling:test; then
    gatling::log "[runtime=${GATLING_RUNTIME_PROFILE}] [model=${model_tag}] [test=${test_type}] [simulation=${simulation_class}] COMPLETE status=FAIL"
    return 1
  fi

  latest_run="$(find "${GATLING_MODULE_PATH}/target/gatling" -mindepth 1 -maxdepth 1 -type d | sort -r | head -n 1 || true)"
  if [[ -n "${latest_run}" ]]; then
    mkdir -p "${output_dir}"
    cp -R "${latest_run}/." "${output_dir}/"

    metadata_file="${output_dir}/metadata.env"
    if [[ -f "${metadata_file}" ]]; then
      req_total="$(sed -n 's/^REQ_TOTAL=//p' "${metadata_file}" | head -n 1)"
      req_ok="$(sed -n 's/^REQ_OK=//p' "${metadata_file}" | head -n 1)"
      req_ko="$(sed -n 's/^REQ_KO=//p' "${metadata_file}" | head -n 1)"
      status="$(sed -n 's/^STATUS=//p' "${metadata_file}" | head -n 1)"
    fi

    if [[ -z "${status}" ]]; then
      if [[ "${req_ko}" =~ ^[0-9]+$ ]] && (( req_ko > 0 )); then
        status="FAIL"
      elif [[ "${req_ko}" =~ ^[0-9]+$ ]]; then
        status="PASS"
      else
        status="UNKNOWN"
      fi
    fi

    cat > "${metadata_file}" <<EOF
MODEL_NAME=${model_tag}
STATUS=${status}
REQ_TOTAL=${req_total}
REQ_OK=${req_ok}
REQ_KO=${req_ko}
MAX_USERS=${GATLING_MAX_USERS}
CONCURRENCY=${GATLING_MAX_USERS}
WARMUP_USERS=${GATLING_WARMUP_USERS}
TEST_TYPE=${test_type}
RUNTIME_PROFILE=${GATLING_RUNTIME_PROFILE}
SIMULATION_CLASS=${simulation_class}
RUN_TIMESTAMP=${timestamp}
EOF
  fi

  gatling::log "[runtime=${GATLING_RUNTIME_PROFILE}] [model=${model_tag}] [test=${test_type}] [simulation=${simulation_class}] COMPLETE status=${status:-UNKNOWN}"
}

gatling::companion_runtime_for() {
  local primary_runtime="$1"
  if [[ "${primary_runtime}" == "java" ]]; then
    printf 'scala'
  else
    printf 'java'
  fi
}

gatling::default_companion_simulation_for() {
  local runtime_profile="$1"
  if [[ "${runtime_profile}" == "java" ]]; then
    printf 'com.modelbox.simulation.ollama.OllamaJavaLoadSimulation'
  else
    printf 'com.modelbox.simulation.ollama.OllamaLoadSimulation'
  fi
}

gatling::run_runtime_suite() {
  local runtime_profile="$1"
  local max_users="$2"
  local warmup_users="$3"
  local simulations_csv="$4"
  local strict_fail="$5"
  local suite_label="$6"

  local model
  local simulation
  local suite_failed=0

  GATLING_RUNTIME_PROFILE="${runtime_profile}"
  GATLING_MAX_USERS="${max_users}"
  GATLING_WARMUP_USERS="${warmup_users}"
  GATLING_SIMULATIONS="${simulations_csv}"

  gatling::resolve_runtime
  gatling::prepare

  gatling::log "[runtime=${GATLING_RUNTIME_PROFILE}] [suite=${suite_label}] Starting runtime suite with users=${GATLING_MAX_USERS}, warmupUsers=${GATLING_WARMUP_USERS}, simulations=${GATLING_SIMULATIONS}"

  IFS=',' read -r -a simulation_list <<< "${GATLING_SIMULATIONS}"
  for model in "${GATLING_MODELS[@]}"; do
    gatling::log "[runtime=${GATLING_RUNTIME_PROFILE}] [suite=${suite_label}] [model=${model}] Starting model test suite"
    for simulation in "${simulation_list[@]}"; do
      [[ -n "${simulation}" ]] || continue
      if ! gatling::run_simulation "${simulation}" "${model}"; then
        suite_failed=1
        gatling::log "[runtime=${GATLING_RUNTIME_PROFILE}] [suite=${suite_label}] [model=${model}] Simulation failed: ${simulation}"
        if [[ "${strict_fail}" == "true" ]]; then
          return 1
        fi
      fi
    done
    gatling::log "[runtime=${GATLING_RUNTIME_PROFILE}] [suite=${suite_label}] [model=${model}] Completed model test suite"
  done

  if [[ "${suite_failed}" -ne 0 ]]; then
    return 1
  fi
}

gatling::write_index() {
  local index_file="${GATLING_REPORT_ROOT}/index.html"

  cat > "${index_file}" <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="120">
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
  <p>Auto-refreshes every 120 seconds.</p>
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
  local primary_runtime
  local companion_runtime
  local primary_simulations
  local primary_max_users
  local primary_warmup_users
  local companion_simulations
  local companion_users

  gatling::resolve_runtime
  primary_runtime="${GATLING_RUNTIME_PROFILE}"
  primary_simulations="${GATLING_SIMULATIONS}"
  primary_max_users="${GATLING_MAX_USERS}"
  primary_warmup_users="${GATLING_WARMUP_USERS}"

  companion_runtime="$(gatling::companion_runtime_for "${primary_runtime}")"
  companion_users="${GATLING_COMPANION_USERS:-1}"
  companion_simulations="${GATLING_COMPANION_SIMULATIONS:-$(gatling::default_companion_simulation_for "${companion_runtime}")}"

  # Always refresh the reports index from completed runs before starting a new test cycle.
  gatling::write_index
  gatling::log "Refreshed report index from completed runs before starting simulations"

  # Keep report-service index in sync even if a simulation fails.
  trap 'gatling::write_index || true' EXIT

  gatling::resolve_models
  gatling::ensure_model_ready

  # Companion runtime is always executed first with a single user to validate both Java and Scala paths.
  if ! gatling::run_runtime_suite "${companion_runtime}" "${companion_users}" "${companion_users}" "${companion_simulations}" "false" "companion"; then
    gatling::log "[runtime=${companion_runtime}] [suite=companion] Companion runtime completed with failures; continuing to primary runtime"
  fi

  # Primary runtime executes with requested settings and remains fail-fast.
  gatling::run_runtime_suite "${primary_runtime}" "${primary_max_users}" "${primary_warmup_users}" "${primary_simulations}" "true" "primary"

  gatling::write_index
  trap - EXIT
  gatling::log "Reports ready at ${GATLING_REPORT_ROOT}/index.html"
}

main "$@"