# Registers a Task Scheduler job that starts the watcher at logon and restarts it on failure.
# Run in PowerShell:  .\deploy\windows-task.ps1 -Node "C:\Program Files\nodejs\node.exe"
param(
  [string]$Node = "C:\Program Files\nodejs\node.exe",
  [string]$Dir = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$Name = "qnet-seat-alert"
)
$action = New-ScheduledTaskAction -Execute $Node -Argument "bin\qnet-alert.js --quiet" -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered '$Name'. Start now: Start-ScheduledTask -TaskName $Name"
