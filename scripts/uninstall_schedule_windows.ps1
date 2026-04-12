Param(
  [string]$TaskName = ""
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot "config\maintenance.json"

if (-not $TaskName -and (Test-Path $configPath)) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  if ($config.schedule.task_name) {
    $TaskName = [string]$config.schedule.task_name
  }
}

if (-not $TaskName) {
  $TaskName = "ai-news-hub-maintenance"
}

schtasks.exe /Delete /TN $TaskName /F | Out-Null
Write-Host "Removed scheduled task '$TaskName'."
