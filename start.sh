#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  kppdf-7.0 launcher v1.0
#  Single-command bootstrap: install deps → start MongoDB+Redis →
#  start backend (NestJS) → start frontend (Angular) → verify.
#
#  Usage:
#    ./start.sh             Full setup + start (default; first-run)
#    ./start.sh setup       Just install deps + .env, no services
#    ./start.sh start       Start services (assumes setup done)
#    ./start.sh stop        Stop dev servers + docker compose down
#    ./start.sh status      Check health of backend + frontend + docker
#    ./start.sh logs        Tail docker compose logs (Ctrl+C to exit)
#    ./start.sh reset       DESTRUCTIVE: stop, remove volumes, wipe
#                           node_modules + .env (re-setup from scratch)
#    ./start.sh --help      Show this help
#
#  Works on: Linux, macOS, Windows (Git Bash / WSL).
#  For native Windows PowerShell use: .\start.ps1
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# Ensure executable (no-op on Windows; one-time fix on Linux/macOS fresh clones)
chmod +x "$0" 2>/dev/null || true

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
RUN_DIR="$ROOT_DIR/.run"

# Colors
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'

banner() {
  printf "${CYAN}${BOLD}"
  printf "  ╔══════════════════════════════════════════╗\n"
  printf "  ║     kppdf-7.0 launcher v1.0             ║\n"
  printf "  ║     Full-stack dev environment          ║\n"
  printf "  ╚══════════════════════════════════════════╝\n"
  printf "${RESET}\n"
}

step()  { printf "\n${CYAN}${BOLD}▶ %s${RESET}\n" "$1"; }
ok()    { printf "  ${GREEN}✅ %s${RESET}\n" "$1"; }
warn()  { printf "  ${YELLOW}⚠️  %s${RESET}\n" "$1"; }
err()   { printf "  ${RED}❌ %s${RESET}\n" "$1" >&2; }
info()  { printf "  ${CYAN}ℹ ${RESET}  %s\n" "$1"; }

# ─── Phase 1: Prerequisite check ──────────────────────────────────
prereq_check() {
  step "Phase 1/8 — Prerequisite check"
  local all_ok=true

  if command -v node >/dev/null 2>&1; then
    local node_v; node_v=$(node -v)
    if [[ "$node_v" =~ ^v(2[2-9]|[3-9][0-9]|[1-9][0-9][0-9])\. ]]; then
      ok "Node.js $node_v"
    else
      warn "Node $node_v — Node 22+ recommended (backend uses engine>=22)"
    fi
  else
    err "Node.js missing — install: https://nodejs.org/"
    all_ok=false
  fi

  if command -v npm >/dev/null 2>&1; then
    ok "npm $(npm -v)"
  else
    err "npm missing — install Node.js >= 22"
    all_ok=false
  fi

  if command -v docker >/dev/null 2>&1; then
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
  else
    err "Docker missing — install: https://docs.docker.com/get-docker/"
    all_ok=false
  fi

  if docker compose version >/dev/null 2>&1; then
    ok "docker compose v2 available"
  elif command -v docker-compose >/dev/null 2>&1; then
    warn "Legacy docker-compose v1 detected — consider upgrading to v2"
  else
    err "Neither 'docker compose' (v2) nor 'docker-compose' (v1) found"
    all_ok=false
  fi

  $all_ok || { err "Prerequisites missing. Install them and re-run."; exit 1; }
}

# ─── Phase 2: Environment setup (.env) ───────────────────────────
env_setup() {
  step "Phase 2/8 — Environment setup"
  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    ok "Created $BACKEND_DIR/.env from .env.example"
    warn "📝 Edit $BACKEND_DIR/.env — set ADMIN_PASSWORD, JWT_SECRET (32+ chars), JWT_REFRESH_SECRET"
  else
    ok "$BACKEND_DIR/.env exists (skipped)"
  fi
}

# ─── Phase 3: Install dependencies ───────────────────────────────
install_deps() {
  step "Phase 3/8 — Install dependencies"

  if [[ -d "$FRONTEND_DIR/node_modules" ]]; then
    ok "frontend/node_modules exists (skipped)"
  else
    info "Installing frontend deps (this may take 2-3 min)..."
    (cd "$FRONTEND_DIR" && npm install --no-fund --no-audit 2>&1 | tail -5) \
      || { err "frontend npm install failed"; exit 1; }
    ok "frontend deps installed"
  fi

  if [[ -d "$BACKEND_DIR/node_modules" ]]; then
    ok "backend/node_modules exists (skipped)"
  else
    info "Installing backend deps (this may take 2-3 min)..."
    (cd "$BACKEND_DIR" && npm install --no-fund --no-audit 2>&1 | tail -5) \
      || { err "backend npm install failed"; exit 1; }
    ok "backend deps installed"
  fi
}

# ─── Phase 4: Start Docker services ─────────────────────────────
docker_up() {
  step "Phase 4/8 — Start Docker services (MongoDB + Redis)"
  (cd "$BACKEND_DIR" && docker compose up -d) \
    || { err "docker compose up failed — try: docker info"; exit 1; }
  ok "MongoDB on :27017 (replica set rs0), Redis on :6379"
}

# ─── Phase 5: Wait for services healthy ──────────────────────────
wait_for_services() {
  step "Phase 5/8 — Wait for services to be healthy"
  local max_wait=90 elapsed=0

  info "Waiting for MongoDB replica set (max 90s)..."
  while (( elapsed < max_wait )); do
    if docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -q 'kppdf7-mongo.*healthy'; then
      ok "MongoDB healthy"
      break
    fi
    sleep 3
    elapsed=$((elapsed + 3))
    printf "."
  done
  printf "\n"

  if (( elapsed >= max_wait )); then
    err "MongoDB not healthy in ${max_wait}s. Run: cd backend && docker compose logs mongo"
    exit 1
  fi

  if docker exec kppdf7-redis redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis healthy (PONG)"
  else
    warn "Redis ping failed — backend /api/health will show degraded"
  fi
}

# ─── Phase 6: Start backend ─────────────────────────────────────
start_backend() {
  step "Phase 6/8 — Start NestJS backend (dev mode, watch enabled)"
  mkdir -p "$RUN_DIR"
  local pidfile="$RUN_DIR/backend.pid"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    ok "Backend already running (PID $(cat "$pidfile"))"
    return
  fi

  info "Starting backend in background..."
  (cd "$BACKEND_DIR" && nohup npm run start:dev > "$RUN_DIR/backend.log" 2>&1 & echo $! > "$pidfile")
  sleep 6
  ok "Backend starting (PID $(cat "$pidfile"), log → $RUN_DIR/backend.log)"
}

# ─── Phase 7: Start frontend ────────────────────────────────────
start_frontend() {
  step "Phase 7/8 — Start Angular frontend (dev mode)"
  local pidfile="$RUN_DIR/frontend.pid"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    ok "Frontend already running (PID $(cat "$pidfile"))"
    return
  fi

  info "Starting frontend in background..."
  (cd "$FRONTEND_DIR" && nohup npm start > "$RUN_DIR/frontend.log" 2>&1 & echo $! > "$pidfile")
  sleep 6
  ok "Frontend starting (PID $(cat "$pidfile"), log → $RUN_DIR/frontend.log)"
}

# ─── Phase 8: Verify & report ───────────────────────────────────
verify() {
  step "Phase 8/8 — Verify & report"
  local max_wait=60 elapsed=0

  while (( elapsed < max_wait )); do
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
      ok "Backend /api/health → 200"
      printf "\n"
      curl -s http://localhost:3000/api/health | python -m json.tool 2>/dev/null \
        || curl -s http://localhost:3000/api/health
      printf "\n"
      break
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  if (( elapsed >= max_wait )); then
    warn "Backend /api/health: not responding in ${max_wait}s. Check: $RUN_DIR/backend.log"
  fi

  printf "\n${GREEN}${BOLD}"
  printf "  ╔══════════════════════════════════════════╗\n"
  printf "  ║  🚀 kppdf-7.0 is RUNNING                ║\n"
  printf "  ╚══════════════════════════════════════════╝\n"
  printf "${RESET}\n"
  printf "  🌐 Frontend:      ${CYAN}http://localhost:4200${RESET}\n"
  printf "  🔌 Backend:       ${CYAN}http://localhost:3000/api/health${RESET}\n"
  printf "  🛢  MongoDB:       ${CYAN}localhost:27017${RESET} (replica set rs0)\n"
  printf "  ⚡ Redis:         ${CYAN}localhost:6379${RESET}\n"
  printf "\n"
  printf "  📄 Logs:   tail -f $RUN_DIR/backend.log\n"
  printf "            tail -f $RUN_DIR/frontend.log\n"
  printf "  🛑 Stop:   ${YELLOW}./start.sh stop${RESET}\n"
  printf "  📊 Status: ${YELLOW}./start.sh status${RESET}\n\n"
}

# ─── Subcommands ────────────────────────────────────────────────
cmd_setup() {
  banner
  prereq_check
  env_setup
  install_deps
  ok "Setup complete. Next: ${CYAN}./start.sh start${RESET}"
}

cmd_start() {
  banner
  prereq_check
  env_setup
  install_deps
  docker_up
  wait_for_services
  start_backend
  start_frontend
  verify
}

cmd_stop() {
  banner
  step "Stopping kppdf-7.0"

  for svc in backend frontend; do
    local pidfile="$RUN_DIR/$svc.pid"
    if [[ -f "$pidfile" ]]; then
      local pid; pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" && ok "Stopped $svc (PID $pid)"
      else
        warn "Stale pidfile for $svc (PID $pid not running)"
      fi
      rm -f "$pidfile"
    else
      info "$svc: no pidfile"
    fi
  done

  (cd "$BACKEND_DIR" && docker compose down) && ok "docker compose down"
  ok "All services stopped"
}

cmd_status() {
  banner
  step "Status"

  if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    ok "Backend up — http://localhost:3000/api/health"
    curl -s http://localhost:3000/api/health | python -m json.tool 2>/dev/null \
      || curl -s http://localhost:3000/api/health
  else
    warn "Backend DOWN"
  fi

  if curl -sf http://localhost:4200 > /dev/null 2>&1; then
    ok "Frontend up — http://localhost:4200"
  else
    warn "Frontend DOWN"
  fi

  printf "\n${CYAN}${BOLD}Docker containers:${RESET}\n"
  (cd "$BACKEND_DIR" && docker compose ps 2>/dev/null) || warn "Cannot query docker compose"
}

cmd_logs() {
  banner
  info "Following docker compose logs (Ctrl+C to exit)..."
  (cd "$BACKEND_DIR" && docker compose logs -f --tail=100)
}

cmd_reset() {
  banner
  warn "${BOLD}This will DESTROY: docker volumes, node_modules, .env${RESET}"
  read -rp "Type 'YES' to confirm: " confirm
  [[ "$confirm" == "YES" ]] || { info "Aborted"; exit 0; }

  cmd_stop
  (cd "$BACKEND_DIR" && docker compose down -v) && ok "Removed docker volumes"
  rm -rf "$FRONTEND_DIR/node_modules" "$BACKEND_DIR/node_modules" && ok "Removed node_modules"
  rm -f  "$BACKEND_DIR/.env" && ok "Removed .env"
  warn "Run ${CYAN}./start.sh start${RESET} to re-setup from scratch"
}

cmd_help() {
  cat <<'EOF'
kppdf-7.0 launcher v1.0

USAGE:
  ./start.sh [command]

COMMANDS:
  (default)    Full setup + start (first run)
  setup        Install deps + .env, no services
  start        Start services (assumes setup done)
  stop         Stop dev servers + docker compose down
  status       Check backend + frontend + docker health
  logs         Tail docker compose logs (Ctrl+C to exit)
  reset        DESTRUCTIVE: stop, remove volumes, wipe node_modules + .env
  --help       Show this help

URLS (after ./start.sh start):
  Frontend:  http://localhost:4200
  Backend:   http://localhost:3000/api/health
  MongoDB:   localhost:27017  (replica set rs0)
  Redis:     localhost:6379

LOGS:
  Backend:    ./.run/backend.log
  Frontend:   ./.run/frontend.log
  Docker:     ./start.sh logs

CROSS-PLATFORM:
  Linux/macOS/Git Bash: ./start.sh
  Windows PowerShell:    .\start.ps1
  npm wrapper:           npm run launch:start
EOF
}

# ─── Dispatch ────────────────────────────────────────────────────
main() {
  local cmd="${1:-}"
  case "$cmd" in
    ""|dev|all)   cmd_start ;;
    setup)        cmd_setup ;;
    start)        cmd_start ;;
    stop)         cmd_stop ;;
    status)       cmd_status ;;
    logs)         cmd_logs ;;
    reset)        cmd_reset ;;
    -h|--help|help) cmd_help ;;
    *)
      err "Unknown command: '$cmd'"
      err "Try: ./start.sh --help"
      exit 1
      ;;
  esac
}

main "$@"
