[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Contract {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Code
  )

  if (-not $Condition) {
    throw "UPDATE_PRODUCTION_CONTRACT_FAILED:$Code"
  }
}

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $scriptDirectory '..')).Path
$updateScript = Join-Path $repositoryRoot 'scripts\update-production.ps1'
$cmdWrapper = Join-Path $repositoryRoot 'scripts\update-production.cmd'

Assert-Contract (Test-Path -LiteralPath $updateScript -PathType Leaf) 'SCRIPT_MISSING'
Assert-Contract (Test-Path -LiteralPath $cmdWrapper -PathType Leaf) 'CMD_MISSING'

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
  $updateScript,
  [ref]$tokens,
  [ref]$parseErrors
)
Assert-Contract ($parseErrors.Count -eq 0) 'POWERSHELL_PARSE'

$source = Get-Content -LiteralPath $updateScript -Raw -Encoding UTF8
$cmdSource = Get-Content -LiteralPath $cmdWrapper -Raw -Encoding ASCII

foreach ($requiredText in @(
    "'--env-file', `$envFile",
    'compose.local.yml',
    'compose.public.yml',
    'compose.cloudflare-tunnel.yml',
    "'--profile', 'public-tunnel'",
    'BUSINESS_NOT_PAUSED',
    'DIRTY_WORKTREE',
    'GIT_NOT_SYNCHRONIZED_WITH_UPSTREAM',
    'verify-windows-secret-file-acl.ps1',
    'scripts/backup-postgres.sh',
    'scripts/backup-storage.sh',
    'REDIS_QUEUE_',
    "'build', 'api', 'web', 'worker-python'",
    "'stop', 'cloudflared', 'nginx', 'web', 'api'",
    "'up', '-d', '--no-build', '--wait'",
    "'prisma', 'migrate', 'status'",
    'scripts/healthcheck.sh',
    'tunnel-origin-probe',
    'Assert-NoRuntimeHostPort',
    'PRODUCTION_UPDATE:PASS'
  )) {
  Assert-Contract ($source.Contains($requiredText)) ("MISSING_{0}" -f ([Math]::Abs($requiredText.GetHashCode())))
}

foreach ($forbiddenPattern in @(
    '(?i)down\s+-v',
    '(?i)docker\s+system\s+prune',
    "(?i)'-lc'",
    '(?i)Remove-Item[^\r\n]*(postgres|storage|\.env|\.secrets)',
    '(?i)Get-Content[^\r\n]*\.env[^\r\n]*(Write-Host|Write-Output|Out-File)'
  )) {
  Assert-Contract (-not [regex]::IsMatch($source, $forbiddenPattern)) 'FORBIDDEN_OPERATION'
}

$buildIndex = $source.IndexOf("'build', 'api', 'web', 'worker-python'", [System.StringComparison]::Ordinal)
$stopIndex = $source.IndexOf("'stop', 'cloudflared', 'nginx', 'web', 'api'", [System.StringComparison]::Ordinal)
$upIndex = $source.IndexOf("'up', '-d', '--no-build', '--wait'", [System.StringComparison]::Ordinal)
Assert-Contract ($buildIndex -ge 0 -and $buildIndex -lt $stopIndex) 'BUILD_MUST_PRECEDE_STOP'
Assert-Contract ($stopIndex -ge 0 -and $stopIndex -lt $upIndex) 'STOP_MUST_PRECEDE_UP'

Assert-Contract ($cmdSource.Contains('update-production.ps1')) 'CMD_TARGET'
Assert-Contract ($cmdSource.Contains('%*')) 'CMD_ARGUMENT_FORWARDING'

$failureOutput = @(& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $updateScript 2>&1)
Assert-Contract ($LASTEXITCODE -ne 0) 'PAUSE_GATE_EXIT'
Assert-Contract (($failureOutput | Out-String).Contains('PRODUCTION_UPDATE_FAILED:BUSINESS_NOT_PAUSED')) 'PAUSE_GATE_CODE'

Write-Output 'Update production contract: PASS'
