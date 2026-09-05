#!/usr/bin/env bash

set -Eeuo pipefail

readonly REPO_DIR="/home/oscarj/opt/MainPortfolio"
readonly BACKEND_DIR="$REPO_DIR/backend"
readonly PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
readonly SERVICE_NAME="oj-builds-api"
readonly LOCAL_HEALTH_URL="http://127.0.0.1:8000/api/health"
readonly PUBLIC_HEALTH_URL="https://api.oscarjohnson.dev/api/health"

readonly STATE_DIR="/home/oscarj/.local/state/mainportfolio"
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
    logger -t mainportfolio-deploy -- "$message"
}

handle_failure() {
    local exit_code="$?"
    local line_number="$1"

    trap - ERR

    log "Deployment failed on line $line_number with exit code $exit_code."

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "The existing backend service is still active."
    else
        log "The backend service is not active."
        sudo journalctl \
            -u "$SERVICE_NAME" \
            -n 50 \
            --no-pager
    fi

    exit "$exit_code"
}

trap 'handle_failure "$LINENO"' ERR

log "Starting MainPortfolio backend deployment."

cd "$REPO_DIR"

if [[ ! -x "$PYTHON_BIN" ]]; then
    log "Python virtual environment not found at $PYTHON_BIN."
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    log "Deployment stopped because the repository has local changes."
    git status --short
    exit 1
fi

previous_commit="$(git rev-parse HEAD)"
log "Current commit: $previous_commit"

log "Fetching origin/main."
git fetch origin main

if ! git merge-base --is-ancestor HEAD origin/main; then
    log "Deployment stopped because the Pi cannot fast-forward to origin/main."
    log "The local and remote branches may have diverged."
    exit 1
fi

log "Updating repository."
git merge --ff-only origin/main

current_commit="$(git rev-parse HEAD)"
log "Selected commit: $current_commit"

log "Installing Python dependencies."
"$PYTHON_BIN" -m pip install \
    --disable-pip-version-check \
    -r "$BACKEND_DIR/requirements.txt"

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
    cd "$REPO_DIR/imports/latex"

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

        # Remove auxiliary files while preserving the PDF.
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
    sudo systemctl status "$SERVICE_NAME" -l --no-pager
    sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager
    exit 1
fi

log "Local health check passed."

if curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null; then
    log "Public Cloudflare health check passed."
else
    # The backend is healthy, so an internet/tunnel problem should be a warning
    # rather than undoing an otherwise successful local deployment.
    log "Warning: public health check failed while local health remained healthy."
fi

deployment_finished_at="$(date +%s)"
deployment_duration="$((deployment_finished_at - deployment_started_at))"

printf '%s\n' "$current_commit" > "$STATE_DIR/current-commit"

log "Deployment completed in ${deployment_duration} seconds."