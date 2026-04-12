Param(
  [int]$IntervalMinutes = 0,
  [string]$TaskName = ""
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot "config\maintenance.json"

if (-not $TaskName) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  if ($config.schedule.task_name) {
    $TaskName = [string]$config.schedule.task_name
  } else {
    $TaskName = "project-reconciler-maintenance"
  }
  if ($IntervalMinutes -le 0) {
    $IntervalMinutes = [int]$config.schedule.windows_interval_minutes
  }
}

if ($IntervalMinutes -le 0) {
  $IntervalMinutes = 60
}

$command = 'cmd /v:on /c "pushd ""{0}"" && (py -3 scripts\run_maintenance.py --mode scheduled >> logs\maintenance_scheduler.log 2>>&1) & set ""_task_exit=!ERRORLEVEL!"" & popd & exit /b !_task_exit!"' -f $repoRoot
schtasks.exe /Create /SC MINUTE /MO $IntervalMinutes /TN $TaskName /TR $command /F | Out-Null

Write-Host "Installed scheduled task '$TaskName' every $IntervalMinutes minutes."
Write-Host $command
