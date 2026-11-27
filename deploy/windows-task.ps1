# Registers a Task Scheduler job that starts the watcher at logon and restarts it on failure.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File .\deploy\windows-task.ps1
param(
  [string]$Node = "",
  [string]$Dir = "",
  [string]$Name = "qnet-seat-alert"
)
$ErrorActionPreference = "Stop"
# $PSScriptRoot is empty inside param() defaults under powershell.exe -File (5.1), so resolve here.
if (-not $Dir) { $Dir = (Resolve-Path "$PSScriptRoot\..").Path }
if (-not $Node) { $Node = (Get-Command node.exe).Source }
if (-not (Test-Path (Join-Path $Dir "config.json"))) { throw "config.json not found in $Dir. Run init first (see README)." }
$action = New-ScheduledTaskAction -Execute $Node -Argument "bin\qnet-alert.js --quiet" -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered '$Name'. Start now: Start-ScheduledTask -TaskName $Name"
