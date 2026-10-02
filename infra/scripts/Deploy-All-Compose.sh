#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"
LOG_DIR="$REPO_ROOT/infra/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/docker-compose-orchestrator-$(date +%Y%m%d-%H%M%S).log"

ACTION="BuildAndUp"
STACK_SELECTORS=()
CLEAN_RECREATE=0
REMOVE_CONTAINERS=0
REMOVE_IMAGES=0
REMOVE_NETWORKS=0
REMOVE_VOLUMES=0
REMOVE_BUILDX=0
CLEANUP_AFTER_BUILD=0
BUILD_FLAG=0
NO_CACHE=0
WAIT_HEALTHY=0
FOLLOW_LOGS=0
SKIP_DOCKER_CHECK=0
QUIET=0

RESULTS=()

print_usage() {
  cat <<'EOF'
Usage: ./infra/scripts/Deploy-All-Compose.sh [options]

Options:
  -a, --action <name>       Action: Up|Down|Build|BuildAndUp|Status|Logs|Config|Restart
  -s, --stack <selector>    Stack selector (repeatable substring match)
      --clean-recreate      Run stack down before cleanup and apply full cleanup flags
      --remove-containers   Remove all Docker containers
      --remove-images       Remove all Docker images
      --remove-networks     Remove all Docker networks
      --remove-volumes      Remove all Docker volumes
      --remove-buildx       Remove all Docker buildx builders
      --cleanup-after-build Run pruning cleanup after orchestration
      --build               Apply --build when action is Up
      --no-cache            Apply --no-cache to build actions
      --wait                Apply --wait --wait-timeout 180 when supported
      --follow-logs         Follow logs when action is Logs
      --skip-docker-check   Skip docker CLI presence check
      --quiet               Reduce console output (file logging remains enabled)
  -h, --help                Show this help message
EOF
}

log_line() {
  local level="$1"
  local message="$2"
  local ts
  ts="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  local line="[$ts] [$level] $message"
  printf '%s\n' "$line" >>"$LOG_FILE"

  if (( QUIET == 1 )); then
    return
  fi

  case "$level" in
    INFO) printf '\033[36m%s\033[0m\n' "$line" ;;
    SUCCESS) printf '\033[32m%s\033[0m\n' "$line" ;;
    WARNING) printf '\033[33m%s\033[0m\n' "$line" ;;
    ERROR) printf '\033[31m%s\033[0m\n' "$line" ;;
    *) printf '%s\n' "$line" ;;
  esac
}

fatal() {
  log_line "ERROR" "$1"
  exit 1
}

join_by() {
  local delim="$1"
  shift
  local out=""
  local first=1
  local value
  for value in "$@"; do
    if (( first == 1 )); then
      out="$value"
      first=0
    else
      out+="$delim$value"
    fi
  done
  printf '%s' "$out"
}

run_docker() {
  local -a cmd=("docker" "$@")
  log_line "INFO" "Running: $(join_by ' ' "${cmd[@]}")"

  if (( QUIET == 1 )); then
    "${cmd[@]}" >>"$LOG_FILE" 2>&1
    return $?
  fi

  "${cmd[@]}" 2>&1 | tee -a "$LOG_FILE"
  return "${PIPESTATUS[0]}"
}

run_docker_capture() {
  local -a cmd=("docker" "$@")
  log_line "INFO" "Capturing: $(join_by ' ' "${cmd[@]}")"

  local output
  if ! output="$("${cmd[@]}" 2>&1)"; then
    printf '%s\n' "$output" >>"$LOG_FILE"
    return 1
  fi

  printf '%s\n' "$output" >>"$LOG_FILE"
  printf '%s\n' "$output"
  return 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -a|--action)
        [[ $# -lt 2 ]] && fatal "Missing value for $1"
        ACTION="$2"
        shift 2
        ;;
      -s|--stack)
        [[ $# -lt 2 ]] && fatal "Missing value for $1"
        STACK_SELECTORS+=("$2")
        shift 2
        ;;
      --clean-recreate)
        CLEAN_RECREATE=1
        shift
        ;;
      --remove-containers)
        REMOVE_CONTAINERS=1
        shift
        ;;
      --remove-images)
        REMOVE_IMAGES=1
        shift
        ;;
      --remove-networks)
        REMOVE_NETWORKS=1
        shift
        ;;
      --remove-volumes)
        REMOVE_VOLUMES=1
        shift
        ;;
      --remove-buildx)
        REMOVE_BUILDX=1
        shift
        ;;
      --cleanup-after-build)
        CLEANUP_AFTER_BUILD=1
        shift
        ;;
      --build)
        BUILD_FLAG=1
        shift
        ;;
      --no-cache)
        NO_CACHE=1
        shift
        ;;
      --wait)
        WAIT_HEALTHY=1
        shift
        ;;
      --follow-logs)
        FOLLOW_LOGS=1
        shift
        ;;
      --skip-docker-check)
        SKIP_DOCKER_CHECK=1
        shift
        ;;
      --quiet)
        QUIET=1
        shift
        ;;
      -h|--help)
        print_usage
        exit 0
        ;;
      *)
        fatal "Unknown argument: $1"
        ;;
    esac
  done

  case "$ACTION" in
    Up|Down|Build|BuildAndUp|Status|Logs|Config|Restart) ;;
    *) fatal "Unsupported action: $ACTION" ;;
  esac
}

discover_compose_files() {
  mapfile -d '' COMPOSE_FILES < <(
    find "$REPO_ROOT" -type f \( -name 'compose*.yml' -o -name 'compose*.yaml' \) \
      ! -path '*/.git/*' \
      ! -path '*/node_modules/*' \
      ! -path '*/.venv/*' \
      -print0 | sort -z
  )

  [[ ${#COMPOSE_FILES[@]} -eq 0 ]] && fatal "No compose files were found under repository root: $REPO_ROOT"
}

preferred_env_names_for_file() {
  local file_name
  file_name="$(basename "$1")"

  case "$file_name" in
    compose.comfyui.gpu.yml|compose.comfyui.gpu.yaml)
      printf '%s\n' 'comfyui-gpu.env' '.env'
      ;;
    compose.comfyui.cpu.yml|compose.comfyui.cpu.yaml)
      printf '%s\n' 'comfyui-cpu.env' '.env'
      ;;
    compose.ollama.gpu.yml|compose.ollama.gpu.yaml)
      printf '%s\n' 'ollama-gpu.env' '.env'
      ;;
    compose.ollama.cpu.yml|compose.ollama.cpu.yaml)
      printf '%s\n' 'ollama-cpu.env' '.env'
      ;;
    compose.gpu.yml|compose.gpu.yaml)
      printf '%s\n' 'comfyui-gpu.env' 'ollama-gpu.env' '.env'
      ;;
    compose.cpu.yml|compose.cpu.yaml)
      printf '%s\n' 'comfyui-cpu.env' 'ollama-cpu.env' '.env'
      ;;
    compose.ollama.yml|compose.ollama.yaml)
      printf '%s\n' 'ollama.env' '.env'
      ;;
    compose.performance.yml|compose.performance.yaml)
      printf '%s\n' 'performance.env' '.env' 'performance-local.env'
      ;;
    *)
      printf '%s\n' '.env'
      ;;
  esac
}

build_stack_descriptor() {
  local file_path="$1"
  local dir
  dir="$(dirname "$file_path")"
  local rel
  rel="${file_path#"$REPO_ROOT"/}"
  local name
  name="$(basename "$dir")/$(basename "$file_path")"

  local env_candidates
  mapfile -t env_candidates < <(preferred_env_names_for_file "$file_path")

  local env_files=()
  local env_name
  for env_name in "${env_candidates[@]}"; do
    local candidate="$dir/$env_name"
    if [[ -f "$candidate" ]]; then
      env_files+=("$candidate")
    fi
  done

  if [[ ${#env_files[@]} -eq 0 ]]; then
    local fallback
    while IFS= read -r fallback; do
      env_files+=("$fallback")
    done < <(find "$dir" -maxdepth 1 -type f -name '*.env' | sort)
  fi

  local env_joined
  env_joined="$(join_by ';' "${env_files[@]}")"
  printf '%s|%s|%s|%s\n' "$name" "$rel" "$file_path" "$env_joined"
}

stack_matches_selector() {
  local name="$1"
  local rel="$2"
  local path="$3"
  local selector="$4"

  [[ "$name" == *"$selector"* || "$rel" == *"$selector"* || "$path" == *"$selector"* ]]
}

select_stacks() {
  STACKS=()
  local descriptor
  for compose_file in "${COMPOSE_FILES[@]}"; do
    descriptor="$(build_stack_descriptor "$compose_file")"
    local name rel path envs
    IFS='|' read -r name rel path envs <<<"$descriptor"

    if [[ ${#STACK_SELECTORS[@]} -eq 0 ]]; then
      STACKS+=("$descriptor")
      continue
    fi

    local wanted
    local matched=0
    for wanted in "${STACK_SELECTORS[@]}"; do
      if stack_matches_selector "$name" "$rel" "$path" "$wanted"; then
        matched=1
        break
      fi
    done

    if (( matched == 1 )); then
      STACKS+=("$descriptor")
    fi
  done

  if [[ ${#STACK_SELECTORS[@]} -gt 0 && ${#STACKS[@]} -eq 0 ]]; then
    fatal "No compose stack matched selectors: $(join_by ', ' "${STACK_SELECTORS[@]}")"
  fi
}

compose_args_base() {
  local compose_file="$1"
  local env_joined="$2"
  local -a args=()

  if [[ -n "$env_joined" ]]; then
    local env_item
    IFS=';' read -r -a env_items <<<"$env_joined"
    for env_item in "${env_items[@]}"; do
      [[ -z "$env_item" ]] && continue
      args+=("--env-file" "$env_item")
    done
  fi

  args+=("-f" "$compose_file")
  printf '%s\n' "${args[@]}"
}

stack_has_build_directive() {
  local compose_file="$1"
  local env_joined="$2"

  local -a base
  mapfile -t base < <(compose_args_base "$compose_file" "$env_joined")

  local config_output
  if ! config_output="$(run_docker_capture compose "${base[@]}" config --format json)"; then
    return 2
  fi

  if grep -q '"build"' <<<"$config_output"; then
    return 0
  fi

  return 1
}

run_cleanup() {
  local run_prune="$1"

  if (( REMOVE_CONTAINERS == 1 )); then
    mapfile -t ids < <(docker container ls -aq)
    if [[ ${#ids[@]} -gt 0 ]]; then
      run_docker rm -f "${ids[@]}" || true
    fi
  fi

  if (( REMOVE_IMAGES == 1 )); then
    mapfile -t ids < <(docker image ls -aq)
    if [[ ${#ids[@]} -gt 0 ]]; then
      run_docker rmi -f "${ids[@]}" || true
    fi
  fi

  if (( REMOVE_NETWORKS == 1 )); then
    mapfile -t ids < <(docker network ls -q)
    if [[ ${#ids[@]} -gt 0 ]]; then
      run_docker network rm "${ids[@]}" || true
    fi
  fi

  if (( REMOVE_VOLUMES == 1 )); then
    mapfile -t ids < <(docker volume ls -q)
    if [[ ${#ids[@]} -gt 0 ]]; then
      run_docker volume rm -f "${ids[@]}" || true
    fi
  fi

  if (( REMOVE_BUILDX == 1 )); then
    mapfile -t ids < <(docker buildx ls --format '{{.Name}}')
    if [[ ${#ids[@]} -gt 0 ]]; then
      local b
      for b in "${ids[@]}"; do
        run_docker buildx rm "$b" || true
      done
    fi
  fi

  if (( run_prune == 1 )); then
    run_docker image prune -af || true
    run_docker volume prune -f || true
    run_docker builder prune -af || true
    run_docker network prune -f || true
  fi
}

record_result() {
  local stack="$1"
  local action="$2"
  local status="$3"
  local duration="$4"
  local command="$5"
  RESULTS+=("$stack|$action|$status|$duration|$LOG_FILE|$command")
}

run_stack_action() {
  local stack_name="$1"
  local compose_file="$2"
  local env_joined="$3"
  local action="$4"

  local -a base
  mapfile -t base < <(compose_args_base "$compose_file" "$env_joined")

  local -a sub=()
  case "$action" in
    Up)
      sub+=(up -d)
      (( BUILD_FLAG == 1 )) && sub+=(--build)
      (( WAIT_HEALTHY == 1 )) && sub+=(--wait --wait-timeout 180)
      ;;
    Down)
      sub+=(down --remove-orphans)
      ;;
    Build)
      sub+=(build)
      (( NO_CACHE == 1 )) && sub+=(--no-cache)
      ;;
    Status)
      sub+=(ps)
      ;;
    Logs)
      sub+=(logs)
      (( FOLLOW_LOGS == 1 )) && sub+=(-f)
      ;;
    Config)
      sub+=(config)
      ;;
    Restart)
      sub+=(restart)
      ;;
    *)
      fatal "Unsupported stack action: $action"
      ;;
  esac

  local command_text
  command_text="docker compose $(join_by ' ' "${base[@]}" "${sub[@]}")"

  local start
  start="$(date +%s)"

  if [[ "$action" == "Build" ]]; then
    local build_probe_status=0
    stack_has_build_directive "$compose_file" "$env_joined" || build_probe_status=$?

    if (( build_probe_status == 1 )); then
      log_line "WARNING" "Skip build for stack $stack_name because it has no build directive."
      record_result "$stack_name" "$action" "Skipped" "0" "$command_text"
      return 0
    fi

    if (( build_probe_status == 2 )); then
      log_line "WARNING" "Unable to pre-validate build directives for stack $stack_name; continuing with docker compose build."
    fi
  fi

  if run_docker compose "${base[@]}" "${sub[@]}"; then
    local end duration
    end="$(date +%s)"
    duration="$((end - start))"
    record_result "$stack_name" "$action" "Completed" "$duration" "$command_text"
    log_line "SUCCESS" "Stack completed: $stack_name | Action: $action"
    return 0
  fi

  local end duration
  end="$(date +%s)"
  duration="$((end - start))"
  record_result "$stack_name" "$action" "Failed" "$duration" "$command_text"
  log_line "ERROR" "Docker Compose execution failed for stack $stack_name | Action: $action"
  return 1
}

print_plan() {
  log_line "INFO" "Docker Compose stack orchestration plan"
  local idx=1
  local row
  for row in "${STACKS[@]}"; do
    local name rel path envs
    IFS='|' read -r name rel path envs <<<"$row"
    log_line "INFO" "[$idx] Stack=$name Action=$ACTION Path=$rel EnvFiles=${envs//;/, }"
    idx=$((idx + 1))
  done
}

print_summary() {
  log_line "SUCCESS" "Orchestration summary"
  local row
  for row in "${RESULTS[@]}"; do
    local stack action status duration logfile command
    IFS='|' read -r stack action status duration logfile command <<<"$row"
    printf '%s\n' "Stack=$stack | Action=$action | Status=$status | DurationSeconds=$duration | LogFile=$logfile" | tee -a "$LOG_FILE"
    printf '%s\n' "Command=$command" | tee -a "$LOG_FILE"
  done
}

main() {
  parse_args "$@"

  if (( SKIP_DOCKER_CHECK == 0 )); then
    command -v docker >/dev/null 2>&1 || fatal "Docker CLI was not found in PATH."
  fi

  if (( CLEAN_RECREATE == 1 )); then
    REMOVE_CONTAINERS=1
    REMOVE_IMAGES=1
    REMOVE_NETWORKS=1
    REMOVE_VOLUMES=1
    REMOVE_BUILDX=1
  fi

  discover_compose_files
  select_stacks
  print_plan

  if (( CLEAN_RECREATE == 1 )); then
    local row
    for row in "${STACKS[@]}"; do
      local name rel path envs
      IFS='|' read -r name rel path envs <<<"$row"
      run_stack_action "$name" "$path" "$envs" "Down" || true
    done
  fi

  if (( REMOVE_CONTAINERS == 1 || REMOVE_IMAGES == 1 || REMOVE_NETWORKS == 1 || REMOVE_VOLUMES == 1 || REMOVE_BUILDX == 1 )); then
    log_line "INFO" "Running preflight Docker cleanup for generated artifacts."
    run_cleanup 0
  fi

  local row
  for row in "${STACKS[@]}"; do
    local name rel path envs
    IFS='|' read -r name rel path envs <<<"$row"

    if [[ "$ACTION" == "BuildAndUp" ]]; then
      run_stack_action "$name" "$path" "$envs" "Build" || fatal "Build failed for stack: $name"
      run_stack_action "$name" "$path" "$envs" "Up" || fatal "Up failed for stack: $name"
    else
      run_stack_action "$name" "$path" "$envs" "$ACTION" || fatal "$ACTION failed for stack: $name"
    fi
  done

  if (( CLEANUP_AFTER_BUILD == 1 || CLEAN_RECREATE == 1 )); then
    log_line "INFO" "Running post-build Docker cleanup for generated artifacts."
    run_cleanup 1
  fi

  print_summary
}

main "$@"
