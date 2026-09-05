#!/usr/bin/env bash

set -Eeuo pipefail

# Discover the repository from this script's location. This supports placing the
# script either in the repository root or in a scripts/ directory.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ -d "$SCRIPT_DIR/backend" ]]; then
    REPO_DIR="$SCRIPT_DIR"
elif [[ -d "$SCRIPT_DIR/../backend" ]]; then
    REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
else
    printf 'Could not find the MainPortfolio backend relative to %s.\n' "$SCRIPT_DIR" >&2
    exit 1
fi

readonly REPO_DIR
readonly BACKEND_DIR="$REPO_DIR/backend"
readonly LATEX_DIR="$REPO_DIR/imports/latex"
readonly PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
readonly SERVICE_NAME="oj-builds-api"
readonly LOCAL_HEALTH_URL="http://127.0.0.1:8000/api/health"
readonly PUBLIC_HEALTH_URL="https://api.oscarjohnson.dev/api/health"

readonly STATE_BASE_DIR="${XDG_STATE_HOME:-${HOME}/.local/state}"
readonly STATE_DIR="${DEPLOYMENT_STATE_DIR:-$STATE_BASE_DIR/mainportfolio}"
readonly LOG_FILE="$STATE_DIR/deployments.log"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"

# Write command output to both the terminal and the persistent deployment log.
exec > >(tee -a "$LOG_FILE") 2>&1

deployment_started_at="$(date +%s)"

log() {
    local message="$1"
    local timestamp

    timestamp="$(date --iso-8601=seconds)"
    printf '[%s] %s\n' "$timestamp" "$message"

    # Journald logging is useful, but it should never decide deployment success.
    logger -t mainportfolio-deploy -- "$message" || true
}

handle_failure() {
    local exit_code="$?"
    local line_number="$1"

    trap - ERR

    log "Deployment failed on line $line_number with exit code $exit_code."

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "The existing backend service is still active."
    else
        log "The backend service is not active. Recent service logs follow."
        sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager || true
    fi

    exit "$exit_code"
}

trap 'handle_failure "$LINENO"' ERR

log "Starting MainPortfolio backend deployment."
log "Repository: $REPO_DIR"

for required_command in git curl latexmk systemctl flock sudo; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        log "Required command is missing: $required_command"
        exit 1
    fi
done

if [[ ! -x "$PYTHON_BIN" ]]; then
    log "Python virtual environment not found at $PYTHON_BIN."
    exit 1
fi

if [[ ! -d "$LATEX_DIR" ]]; then
    log "TexVoice LaTeX directory not found at $LATEX_DIR."
    exit 1
fi

# Prevent two manual or scheduled deployments from running at the same time.
exec 9>"$STATE_DIR/deploy.lock"
if ! flock -n 9; then
    log "Another backend deployment is already running."
    exit 1
fi

# Ask for sudo access before dependency checks and PDF compilation begin.
log "Checking permission to restart $SERVICE_NAME."
sudo -v

# This is read-only. It records which manually pulled commit was deployed, but
# the script never changes the repository.
if current_commit="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null)"; then
    log "Deploying checked-out commit: $current_commit"
else
    current_commit="unknown"
    log "Warning: the current Git commit could not be determined."
fi

log "Installing Python dependencies."
"$PYTHON_BIN" -m pip install \
    --disable-pip-version-check \
    -r "$BACKEND_DIR/requirements.txt"

log "Checking Python dependency consistency."
"$PYTHON_BIN" -m pip check

log "Checking Python syntax."
"$PYTHON_BIN" -m compileall \
    -q \
    -x '(^|/)\.venv/' \
    "$BACKEND_DIR"

log "Import-testing the FastAPI application."
(
    cd "$BACKEND_DIR"
    "$PYTHON_BIN" -c 'import main; assert main.app is not None'
)

log "Building TexVoice library PDFs."
(
    cd "$LATEX_DIR"

    shopt -s nullglob
    tex_sources=(*.tex)

    if [[ "${#tex_sources[@]}" -eq 0 ]]; then
        log "No TexVoice LaTeX sources were found."
    fi

    for source_file in "${tex_sources[@]}"; do
        log "Compiling $source_file."
        latexmk \
            -pdf \
            -interaction=nonstopmode \
            -halt-on-error \
            "$source_file"

        # Preserve the PDF while removing auxiliary LaTeX build files.
        latexmk -c "$source_file"
    done
)

log "Restarting $SERVICE_NAME."
sudo systemctl restart "$SERVICE_NAME"

log "Waiting for the local health endpoint."
backend_healthy=false

for attempt in {1..20}; do
    if curl -fsS "$LOCAL_HEALTH_URL" >/dev/null; then
        backend_healthy=true
        break
    fi

    sleep 1
done

if [[ "$backend_healthy" != true ]]; then
    log "The local health check failed."
    sudo systemctl status "$SERVICE_NAME" -l --no-pager || true
    sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager || true
    exit 1
fi

log "Local health check passed."

if curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null; then
    log "Public Cloudflare health check passed."
else
    # A healthy local service means a tunnel/network problem should be reported
    # without marking the backend restart itself as failed.
    log "Warning: public health check failed while local health remained healthy."
fi

deployment_finished_at="$(date +%s)"
deployment_duration="$((deployment_finished_at - deployment_started_at))"

if [[ "$current_commit" != "unknown" ]]; then
    printf '%s\n' "$current_commit" > "$STATE_DIR/current-commit"
fi

log "Deployment completed successfully in ${deployment_duration} seconds."