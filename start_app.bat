@echo off
setlocal
title AAST Finance Manager
cd /d "%~dp0"

echo Checking development server ports...
powershell -NoProfile -Command "$ports = @(5000,5175); foreach ($port in $ports) { $client = New-Object System.Net.Sockets.TcpClient; try { $client.Connect('localhost', $port); Write-Host ('Port ' + $port + ' is already in use. Stop the previous server before launching again.'); exit 1 } catch {} finally { $client.Dispose() } }"
if errorlevel 1 (
  echo Startup cancelled. No existing processes were stopped.
  pause
  exit /b 1
)

echo Starting local PostgreSQL...
call npm --prefix backend run db:start
if errorlevel 1 exit /b 1
call npm --prefix backend run db:deploy
if errorlevel 1 exit /b 1

echo [1/2] Starting Backend Server...
cd /d "%~dp0backend"
start /b cmd /c npm run dev

echo Waiting for backend readiness...
powershell -NoProfile -Command "$ready = $false; for ($attempt = 0; $attempt -lt 30; $attempt++) { try { $health = Invoke-RestMethod 'http://localhost:5000/api/health' -TimeoutSec 1; if ($health.status -eq 'ok') { $ready = $true; break } } catch {}; Start-Sleep -Milliseconds 500 }; if (-not $ready) { exit 1 }"
if errorlevel 1 (
  echo Backend did not become ready. See the error above. Frontend was not started.
  pause
  exit /b 1
)

echo [2/2] Starting Frontend Server...
cd /d "%~dp0frontend"
call npm run dev
endlocal
