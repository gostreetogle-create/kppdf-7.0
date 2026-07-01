# ─────────────────────────────────────────────────────────────────────
#  kppdf-7.0 launcher v1.0  (PowerShell — native Windows)
#  Subcommands: setup/start/stop/status/logs/reset/help
#  See: .\start.ps1 --help  or  ./start.sh --help  (bash equivalent)
# ─────────────────────────────────────────────────────────────────────

[CmdletBinding()]
param(
  [Parameter(Position=0)]
  [ValidateSet('','dev','all','setup','start','stop','status','logs','reset','help','-h','--help')]
  [string]$Command = ''
)

$ErrorActionPreference = 'Stop'

$RootDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $RootDir 'frontend'
$BackendDir  = Join-Path $RootDir 'backend'
$RunDir      = Join-Path $RootDir '.run'

# Colors
$RED = "`e[0;31m"; $GREEN = "`e[0;32m"; $YELLOW = "`e[1;33m"
$CYAN = "`e[0;36m"; $BOLD = "`e[1m"; $RESET = "`e[0m"

function Banner {
  Write-Host "${CYAN}${BOLD}"
  Write-Host "  ╔══════════════════════════════════════════╗"
  Write-Host "  ║     kppdf-7.0 launcher v1.0             ║"
  Write-Host "  ║     Full-stack dev environment          ║"
  Write-Host "  ╚══════════════════════════════════════════╝"
  Write-Host "${RESET}"
}
function Step { param([string]$Msg) Write-Host "`n${CYAN}${BOLD}▶ $Msg${RESET}" }
function Ok   { param([string]$Msg) Write-Host "  ${GREEN}✅ $Msg${RESET}" }
function Warn { param([string]$Msg) Write-Host "  ${YELLOW}⚠️  $Msg${RESET}" }
function Err  { param([string]$Msg) Write-Host "  ${RED}❌ $Msg${RESET}" }
function Info { param([string]$Msg) Write-Host "  ${CYAN}ℹ ${RESET}  $Msg" }

# ─── Phase 1: Prerequisite check ──────────────────────────────
function PrereqCheck {
  Step 'Phase 1/8 — Prerequisite check'
  $allOk = $true
  try {
    $nodeV = (& node -v) 2>$null
    if ($nodeV -and ($nodeV -match '^v(2[2-9]|[3-9][0-9]|[1-9][0-9][0-9])\.')) {
      Ok "Node.js $nodeV"
    } else { Warn "Node $nodeV — Node 22+ recommended" }
  } catch { Err "Node.js missing — install: https://nodejs.org/"; $allOk = $false }
  try { Ok "npm $(& npm -v)" } catch { Err "npm missing"; $allOk = $false }
  try { Ok "Docker $(& docker --version)" } catch { Err "Docker missing — install: https://docs.docker.com/get-docker/"; $allOk = $false }
  try { & docker compose version 2>$null | Out-Null; Ok "docker compose v2 available" } catch {
    try { & docker-compose --version 2>$null | Out-Null; Warn "Legacy docker-compose v1 — consider upgrade" } catch {
      Err "Neither docker compose v2 nor v1 found"; $allOk = $false
    }
  }
  if (-not $allOk) { Err "Prerequisites missing. Install them and re-run."; exit 1 }
}

# ─── Phase 2: Environment setup ──────────────────────────────
function EnvSetup {
  Step 'Phase 2/8 — Environment setup'
  $envFile = Join-Path $BackendDir '.env'
  if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $BackendDir '.env.example') $envFile
    Ok "Created $envFile from .env.example"
    Warn "📝 Edit $envFile — set ADMIN_PASSWORD, JWT_SECRET (32+ chars), JWT_REFRESH_SECRET"
  } else { Ok "$envFile exists (skipped)" }
}

# ─── Phase 3: Install dependencies ───────────────────────────
function InstallDeps {
  Step 'Phase 3/8 — Install dependencies'
  if (Test-Path (Join-Path $FrontendDir 'node_modules')) {
    Ok "frontend/node_modules exists (skipped)"
  } else {
    Info "Installing frontend deps (this may take 2-3 min)..."
    Push-Location $FrontendDir
    npm install --no-fund --no-audit 2>&1 | Select-Object -Last 5
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Err "frontend npm install failed"; exit 1 }
    Ok "frontend deps installed"
  }
  if (Test-Path (Join-Path $BackendDir 'node_modules')) {
    Ok "backend/node_modules exists (skipped)"
  } else {
    Info "Installing backend deps (this may take 2-3 min)..."
    Push-Location $BackendDir
    npm install --no-fund --no-audit 2>&1 | Select-Object -Last 5
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Err "backend npm install failed"; exit 1 }
    Ok "backend deps installed"
  }
}

# ─── Phase 4: Docker up ──────────────────────────────────────
function DockerUp {
  Step 'Phase 4/8 — Start Docker services (MongoDB + Redis)'
  Push-Location $BackendDir
  docker compose up -d
  Pop-Location
  if ($LASTEXITCODE -ne 0) { Err "docker compose up failed"; exit 1 }
  Ok "MongoDB on :27017 (replica set rs0), Redis on :6379"
}

# ─── Phase 5: Wait for services ──────────────────────────────
function WaitForServices {
  Step 'Phase 5/8 — Wait for services to be healthy'
  $maxWait = 90; $elapsed = 0
  Info "Waiting for MongoDB replica set (max 90s)..."
  while ($elapsed -lt $maxWait) {
    $ps = docker ps --format '{{.Names}} {{.Status}}' 2>$null
    if ($ps -and ($ps -match 'kppdf7-mongo.*healthy')) { Ok "MongoDB healthy"; break }
    Start-Sleep -Seconds 3; $elapsed += 3; Write-Host "." -NoNewline
  }
  Write-Host ""
  if ($elapsed -ge $maxWait) {
    Err "MongoDB not healthy in ${maxWait}s. Run: cd backend ; docker compose logs mongo"; exit 1
  }
  try {
    if ((docker exec kppdf7-redis redis-cli ping 2>$null) -match 'PONG') { Ok "Redis healthy (PONG)" }
    else { Warn "Redis ping failed — backend will report degraded" }
  } catch { Warn "Redis check failed — backend will report degraded" }
}

# ─── Phase 6: Start backend ──────────────────────────────────
function StartBackend {
  Step 'Phase 6/8 — Start NestJS backend (dev mode, watch enabled)'
  if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Path $RunDir | Out-Null }
  $pidfile = Join-Path $RunDir 'backend.pid'
  if ((Test-Path $pidfile) -and (Get-Process -Id (Get-Content $pidfile) -ErrorAction SilentlyContinue)) {
    Ok "Backend already running (PID $(Get-Content $pidfile))"; return
  }
  Info "Starting backend in background..."
  $logFile = Join-Path $RunDir 'backend.log'
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c','cd','/d',$BackendDir,'&&','npm','run','start:dev' `
    -RedirectStandardOutput $logFile -RedirectStandardError $logFile `
    -WindowStyle Hidden -PassThru
  $proc.Id | Out-File -FilePath $pidfile -Encoding utf8
  Start-Sleep -Seconds 6
  Ok "Backend starting (PID $proc.Id, log → $logFile)"
}

# ─── Phase 7: Start frontend ─────────────────────────────────
function StartFrontend {
  Step 'Phase 7/8 — Start Angular frontend (dev mode)'
  $pidfile = Join-Path $RunDir 'frontend.pid'
  if ((Test-Path $pidfile) -and (Get-Process -Id (Get-Content $pidfile) -ErrorAction SilentlyContinue)) {
    Ok "Frontend already running (PID $(Get-Content $pidfile))"; return
  }
  Info "Starting frontend in background..."
  $logFile = Join-Path $RunDir 'frontend.log'
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c','cd','/d',$FrontendDir,'&&','npm','start' `
    -RedirectStandardOutput $logFile -RedirectStandardError $logFile `
    -WindowStyle Hidden -PassThru
  $proc.Id | Out-File -FilePath $pidfile -Encoding utf8
  Start-Sleep -Seconds 6
  Ok "Frontend starting (PID $proc.Id, log → $logFile)"
}

# ─── Phase 8: Verify & report ────────────────────────────────
function Verify {
  Step 'Phase 8/8 — Verify & report'
  $maxWait = 60; $elapsed = 0
  while ($elapsed -lt $maxWait) {
    try {
      $resp = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
      if ($resp.StatusCode -eq 200) {
        Ok "Backend /api/health → 200"; Write-Host ""
        $resp.Content | ConvertFrom-Json | ConvertTo-Json -Depth 4
        Write-Host ""; break
      }
    } catch { }
    Start-Sleep -Seconds 3; $elapsed += 3
  }
  if ($elapsed -ge $maxWait) {
    Warn "Backend /api/health: not responding in ${maxWait}s. Check: $RunDir\backend.log"
  }
  Write-Host "`n${GREEN}${BOLD}"
  Write-Host "  ╔══════════════════════════════════════════╗"
  Write-Host "  ║  🚀 kppdf-7.0 is RUNNING                ║"
  Write-Host "  ╚══════════════════════════════════════════╝"
  Write-Host "${RESET}"
  Write-Host "  🌐 Frontend:      ${CYAN}http://localhost:4200${RESET}"
  Write-Host "  🔌 Backend:       ${CYAN}http://localhost:3000/api/health${RESET}"
  Write-Host "  🛢  MongoDB:       ${CYAN}localhost:27017${RESET} (replica set rs0)"
  Write-Host "  ⚡ Redis:         ${CYAN}localhost:6379${RESET}"
  Write-Host ""
  Write-Host "  📄 Logs:    Get-Content $RunDir\backend.log -Wait"
  Write-Host "             Get-Content $RunDir\frontend.log -Wait"
  Write-Host "  🛑 Stop:    ${YELLOW}.\start.ps1 stop${RESET}"
  Write-Host "  📊 Status:  ${YELLOW}.\start.ps1 status${RESET}`n"
}

# ─── Subcommands ────────────────────────────────────────────
function CmdSetup {
  Banner; PrereqCheck; EnvSetup; InstallDeps
  Ok "Setup complete. Next: ${CYAN}.\start.ps1 start${RESET}"
}
function CmdStart {
  Banner; PrereqCheck; EnvSetup; InstallDeps; DockerUp
  WaitForServices; StartBackend; StartFrontend; Verify
}
function CmdStop {
  Banner; Step 'Stopping kppdf-7.0'
  foreach ($svc in @('backend','frontend')) {
    $pf = Join-Path $RunDir "$svc.pid"
    if (Test-Path $pf) {
      try { Stop-Process -Id (Get-Content $pf) -ErrorAction Stop; Ok "Stopped $svc (PID $(Get-Content $pf))" }
      catch { Warn "$svc: PID not running" }
      Remove-Item $pf -Force
    } else { Info "$svc: no pidfile" }
  }
  Push-Location $BackendDir; docker compose down; Pop-Location
  Ok "All services stopped"
}
function CmdStatus {
  Banner; Step 'Status'
  try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    Ok "Backend up — http://localhost:3000/api/health ($($resp.StatusCode))"
  } catch { Warn "Backend DOWN" }
  try {
    $resp2 = Invoke-WebRequest -Uri 'http://localhost:4200' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    Ok "Frontend up — http://localhost:4200 ($($resp2.StatusCode))"
  } catch { Warn "Frontend DOWN" }
  Write-Host "`n${CYAN}${BOLD}Docker containers:${RESET}"
  Push-Location $BackendDir; docker compose ps 2>$null; Pop-Location
}
function CmdLogs {
  Banner; Info "Following docker compose logs (Ctrl+C to exit)..."
  Push-Location $BackendDir; docker compose logs -f --tail 100; Pop-Location
}
function CmdReset {
  Banner
  Warn "${BOLD}This will DESTROY: docker volumes, node_modules, .env${RESET}"
  $confirm = Read-Host "Type 'YES' to confirm"
  if ($confirm -ne 'YES') { Info "Aborted"; exit 0 }
  CmdStop
  Push-Location $BackendDir; docker compose down -v; Pop-Location; Ok "Removed docker volumes"
  Remove-Item -Recurse -Force (Join-Path $FrontendDir 'node_modules') -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force (Join-Path $BackendDir 'node_modules')  -ErrorAction SilentlyContinue
  Ok "Removed node_modules"
  Remove-Item -Force (Join-Path $BackendDir '.env') -ErrorAction SilentlyContinue
  Ok "Removed .env"
  Warn "Run ${CYAN}.\start.ps1 start${RESET} to re-setup from scratch"
}
function CmdHelp {
  @'
kppdf-7.0 launcher v1.0

USAGE:
  .\start.ps1 [command]

COMMANDS: setup | start | stop | status | logs | reset | --help
  (default)    Full setup + start (first run)
  setup        Install deps + .env, no services
  start        Start services (assumes setup done)
  stop         Stop dev servers + docker compose down
  status       Check backend + frontend + docker health
  logs         Tail docker compose logs (Ctrl+C to exit)
  reset        DESTRUCTIVE: stop, remove volumes, wipe node_modules + .env
  --help       Show this help

URLS (after .\start.ps1 start):
  Frontend:  http://localhost:4200
  Backend:   http://localhost:3000/api/health
  MongoDB:   localhost:27017  (replica set rs0)
  Redis:     localhost:6379

CROSS-PLATFORM:
  Linux/macOS/Git Bash: ./start.sh
  Windows PowerShell:    .\start.ps1
  npm wrapper:           npm run launch:start
'@
}

# ─── Dispatch ────────────────────────────────────────────────
switch ($Command) {
  { $_ -in @('','dev','all') } { CmdStart }
  'setup'  { CmdSetup }
  'start'  { CmdStart }
  'stop'   { CmdStop }
  'status' { CmdStatus }
  'logs'   { CmdLogs }
  'reset'  { CmdReset }
  { $_ -in @('help','-h','--help') } { CmdHelp }
  default { Err "Unknown command: '$Command'"; Err "Try: .\start.ps1 --help"; exit 1 }
}
