<#
.SYNOPSIS
    Starts the whole site locally for testing: main API, avatar worker +
    gateway (with Ollama), and the Next.js frontend, each in its own tab.

.DESCRIPTION
    Local testing only — the Pi still deploys with backend-deployment.sh.
    Every service runs with auto-reload, so code edits apply without a restart.
    Close a tab (or Ctrl+C in it) to stop that service.

      API        http://localhost:8000      (docs at /docs)
      Worker     http://localhost:8100      (talks to Ollama on :11434)
      Gateway    http://localhost:8200
      Frontend   http://localhost:3000

.EXAMPLE
    .\dev.ps1                 # everything
    .\dev.ps1 -NoAvatar       # skip Ollama, worker and gateway
    .\dev.ps1 -Docker         # API + gateway in Docker instead of the venv
#>
param(
    [switch]$NoAvatar,
    [switch]$NoFrontend,
    [switch]$Docker
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Venv = Join-Path $Backend '.venv'
$Python = Join-Path $Venv 'Scripts\python.exe'

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }

# ---------------------------------------------------------------------------
# Python environment: one venv in backend\.venv for the API and both avatar
# services. Reinstalls only when a requirements file changed.
# ---------------------------------------------------------------------------
function Initialize-Venv {
    if (-not (Test-Path $Python)) {
        Write-Step 'Creating backend\.venv'
        python -m venv $Venv
    }
    $reqFiles = @(
        (Join-Path $Backend 'requirements.txt'),
        (Join-Path $Backend 'avatar\gateway\requirements.txt'),
        (Join-Path $Backend 'avatar\worker\requirements.txt')
    )
    $hash = ($reqFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }) -join ''
    $stamp = Join-Path $Venv '.requirements-hash'
    if (-not (Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $hash) {
        Write-Step 'Installing Python requirements'
        $pipArgs = @('-m', 'pip', 'install', '--disable-pip-version-check', '-q')
        foreach ($f in $reqFiles) { $pipArgs += @('-r', $f) }
        & $Python @pipArgs
        if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }
        Set-Content -Path $stamp -Value $hash -Encoding ascii
    }
}

function Test-Port([int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect('127.0.0.1', $Port)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

# ---------------------------------------------------------------------------
# Tabs: Windows Terminal when available, otherwise separate PowerShell windows.
# ---------------------------------------------------------------------------
$tabs = New-Object System.Collections.Generic.List[object]

function Add-Tab([string]$Title, [string]$Dir, [string]$Command) {
    $tabs.Add([pscustomobject]@{ Title = $Title; Dir = $Dir; Command = $Command })
}

# Commands are passed base64-encoded so their quotes and spaces survive the
# trip through Start-Process untouched.
function ConvertTo-Encoded([string]$Command) {
    [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
}

# Windows Terminal starts tabs with the environment it had when it first
# launched, which can predate tools installed since (Node, Ollama, …). So each
# tab gets the full path to this shell (powershell.exe or pwsh.exe) and a
# copy of this shell's PATH.
$Shell = (Get-Process -Id $PID).Path
$PathSetup = "`$env:Path = '$($env:Path -replace "'", "''")'; "

function Start-Tabs {
    $wt = Get-Command wt.exe -ErrorAction SilentlyContinue
    if ($wt) {
        $parts = foreach ($t in $tabs) {
            "new-tab --title `"$($t.Title)`" -d `"$($t.Dir)`" `"$Shell`" -NoExit -EncodedCommand $(ConvertTo-Encoded ($PathSetup + $t.Command))"
        }
        Start-Process wt.exe -ArgumentList ("-w new " + ($parts -join ' ; '))
    } else {
        foreach ($t in $tabs) {
            $cmd = "$PathSetup`$Host.UI.RawUI.WindowTitle = '$($t.Title)'; $($t.Command)"
            Start-Process $Shell -WorkingDirectory $t.Dir -ArgumentList "-NoExit -EncodedCommand $(ConvertTo-Encoded $cmd)"
        }
    }
}

# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------
if (-not $Docker -or -not $NoAvatar) {
    Initialize-Venv
}

if ($Docker) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed.' }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is installed but not running. Start Docker Desktop first.' }
    $services = if ($NoAvatar) { 'api' } else { 'api avatar-gateway' }
    Add-Tab 'Docker' $Root "docker compose up --build $services"
} else {
    Add-Tab 'API :8000' $Backend "& '$Python' -m uvicorn main:app --reload --port 8000"
}

if (-not $NoAvatar) {
    if (Test-Port 11434) {
        Write-Step 'Ollama is already running'
    } elseif (Get-Command ollama -ErrorAction SilentlyContinue) {
        Add-Tab 'Ollama' $Root 'ollama serve'
    } else {
        Write-Warning 'Ollama is not installed or running, so the avatar worker will report itself unhealthy.'
    }

    $workerDir = Join-Path $Backend 'avatar\worker'
    Add-Tab 'Worker :8100' $workerDir "& '$Python' -m uvicorn main:app --reload --port 8100"
    if (-not $Docker) {
        $gatewayDir = Join-Path $Backend 'avatar\gateway'
        Add-Tab 'Gateway :8200' $gatewayDir "& '$Python' -m uvicorn main:app --reload --port 8200"
    }
}

if (-not $NoFrontend) {
    if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
        Write-Step 'Installing frontend packages'
        Push-Location $Frontend
        try { npm.cmd install } finally { Pop-Location }
    }
    # Point the explain page at the local API for this session only; a
    # variable set in the shell wins over the one in .env.local.
    # npm.cmd rather than npm: PowerShell would pick npm.ps1, which the
    # script execution policy can block.
    Add-Tab 'Frontend :3000' $Frontend "`$env:NEXT_PUBLIC_EXPLAIN_API_URL = 'http://localhost:8000/api/explain'; npm.cmd run dev"
}

Write-Step "Starting $($tabs.Count) service(s)"
Start-Tabs

Write-Host ''
Write-Host '  API        http://localhost:8000/docs'
if (-not $NoAvatar) {
    Write-Host '  Worker     http://localhost:8100/health'
    Write-Host '  Gateway    http://localhost:8200'
}
if (-not $NoFrontend) { Write-Host '  Frontend   http://localhost:3000' }
Write-Host ''
