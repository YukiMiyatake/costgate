#Requires -Version 5.1
<#
.SYNOPSIS
  Emergency repair for Windows Cursor user hooks (%USERPROFILE%\.cursor\hooks.json).

.DESCRIPTION
  Strips CostGate failClosed and rewrites broken MSYS / unquoted hook commands so
  Agent is not blocked across every workspace (including CastLine).

  Run from PowerShell on Windows (CostGate checkout optional — pass -HooksPath):

    powershell -ExecutionPolicy Bypass -File scripts\repair-cursor-hooks.ps1
    powershell -ExecutionPolicy Bypass -File scripts\repair-cursor-hooks.ps1 -HooksPath "$env:USERPROFILE\.cursor\hooks.json"

.NOTES
  After repair: fully quit all Cursor windows, then reopen.
#>
[CmdletBinding()]
param(
  [string]$HooksPath = (Join-Path $env:USERPROFILE ".cursor\hooks.json"),
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$CostGateScripts = @(
  "cursor-registry-hook.mjs",
  "cursor-prompt-intent-hook.mjs",
  "cursor-shield-prompt-hook.mjs",
  "cursor-shield-mcp-hook.mjs",
  "cursor-shield-read-hook.mjs"
)

function Test-CostGateCommand([string]$Command) {
  if (-not $Command) { return $false }
  foreach ($name in $CostGateScripts) {
    if ($Command -like "*$name*") { return $true }
  }
  return $false
}

function ConvertTo-WindowsHookCommand([string]$Command) {
  if (-not $Command) { return $Command }
  if ($Command -match '(?i)^cmd\s+/c\s+') { return $Command }

  # node /e/Work/... or node "/e/Work/..." or node /mnt/e/...
  if ($Command -match '(?i)^\s*node\s+("?)(/mnt/([A-Za-z])/(.+?)\.mjs|/([A-Za-z])/(.+?)\.mjs)\1\s*$') {
    $drive = if ($Matches[3]) { $Matches[3] } else { $Matches[5] }
    $rest = if ($Matches[4]) { $Matches[4] } else { $Matches[6] }
    $win = ("{0}:\{1}.mjs" -f $drive.ToUpperInvariant(), ($rest -replace "/", "\"))
    return "cmd /c node `"$win`""
  }

  # node E:\Work\...unquoted or node "E:\Work\...."
  if ($Command -match '(?i)^\s*node\s+"?([A-Za-z]:\\.+?\.mjs)"?\s*$') {
    $win = $Matches[1]
    return "cmd /c node `"$win`""
  }

  return $Command
}

if (-not (Test-Path -LiteralPath $HooksPath)) {
  Write-Host "[cursor:hooks:repair:win] missing: $HooksPath"
  Write-Host "[cursor:hooks:repair:win] nothing to repair (Windows Cursor hooks not found)."
  exit 0
}

$raw = Get-Content -LiteralPath $HooksPath -Raw -Encoding UTF8
try {
  $config = $raw | ConvertFrom-Json
} catch {
  Write-Error "[cursor:hooks:repair:win] invalid JSON: $HooksPath — $_"
}

if (-not $config.hooks) {
  Write-Host "[cursor:hooks:repair:win] no hooks key — leaving file as-is"
  exit 0
}

$backup = "$HooksPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $HooksPath -Destination $backup -Force
Write-Host "[cursor:hooks:repair:win] backup: $backup"

$changed = 0
$failClosedRemoved = 0

foreach ($prop in @($config.hooks.PSObject.Properties)) {
  $list = $prop.Value
  if ($null -eq $list) { continue }
  # ConvertFrom-Json may yield a single object instead of array
  if ($list -isnot [System.Array]) { $list = @($list) }

  for ($i = 0; $i -lt $list.Count; $i++) {
    $hook = $list[$i]
    if (-not (Test-CostGateCommand ([string]$hook.command))) { continue }

    $beforeCmd = [string]$hook.command
    $afterCmd = ConvertTo-WindowsHookCommand $beforeCmd
    if ($afterCmd -ne $beforeCmd) {
      $hook.command = $afterCmd
      $changed += 1
      Write-Host ("  rewrite {0}: {1} -> {2}" -f $prop.Name, $beforeCmd, $afterCmd)
    }

    if ($null -ne $hook.PSObject.Properties["failClosed"]) {
      $hook.PSObject.Properties.Remove("failClosed")
      $failClosedRemoved += 1
      $changed += 1
      Write-Host ("  strip failClosed on {0}" -f $prop.Name)
    }
  }

  # write back possible single-element normalization
  $config.hooks.($prop.Name) = @($list)
}

Write-Host "[cursor:hooks:repair:win] failClosed removed: $failClosedRemoved; command rewrites: changes tracked in total=$changed"

if ($WhatIf) {
  Write-Host "[cursor:hooks:repair:win] WhatIf — not writing $HooksPath"
  exit 0
}

$json = $config | ConvertTo-Json -Depth 100
# PowerShell's ConvertTo-Json can emit oddly ordered keys; UTF-8 no BOM for Cursor.
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($HooksPath, $json + "`n", $utf8)

Write-Host "[cursor:hooks:repair:win] OK — wrote $HooksPath"
Write-Host "[cursor:hooks:repair:win] Fully quit Cursor (all windows), then reopen."
exit 0
