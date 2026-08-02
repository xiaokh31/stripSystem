[CmdletBinding()]
param(
  [switch]$BusinessPaused,
  [switch]$ValidateOnly,
  [switch]$AllowDirtyWorktreeForValidation,
  [string]$BackupDirectory = 'C:\bestar-backups',
  [int]$WaitTimeoutSeconds = 600
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Stop-ProductionUpdate {
  param([Parameter(Mandatory = $true)][string]$Code)

  throw "PRODUCTION_UPDATE_FAILED:$Code"
}

function Write-UpdateStep {
  param([Parameter(Mandatory = $true)][string]$Message)

  Write-Host "[production-update] $Message"
}

function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$FailureCode,
    [switch]$Capture
  )

  if ($Capture) {
    $captured = @(& $FilePath @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
      Stop-ProductionUpdate $FailureCode
    }
    return $captured
  }

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    Stop-ProductionUpdate $FailureCode
  }
}

function Read-DotEnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      continue
    }

    $key = $Matches[1]
    $value = $Matches[2].Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }

  return $values
}

function Get-GitBashPath {
  $candidates = @()
  if ($env:BESTAR_GIT_BASH) {
    $candidates += $env:BESTAR_GIT_BASH
  }
  if ($env:ProgramFiles) {
    $candidates += (Join-Path $env:ProgramFiles 'Git\bin\bash.exe')
  }
  if (${env:ProgramW6432}) {
    $candidates += (Join-Path ${env:ProgramW6432} 'Git\bin\bash.exe')
  }
  if (${env:ProgramFiles(x86)}) {
    $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe')
  }
  if ($env:LocalAppData) {
    $candidates += (Join-Path $env:LocalAppData 'Programs\Git\bin\bash.exe')
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  Stop-ProductionUpdate 'GIT_BASH_MISSING'
}

function Get-ComposeConfig {
  param([Parameter(Mandatory = $true)][string[]]$BaseArguments)

  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $arguments = @($BaseArguments) + @(
      '--profile', 'public-tunnel',
      'config', '--format', 'json'
    )
    $json = (& docker @arguments 2> $stderrPath | Out-String)
    if ($LASTEXITCODE -ne 0) {
      Stop-ProductionUpdate 'COMPOSE_CONFIG_INVALID'
    }
    try {
      return ($json | ConvertFrom-Json)
    }
    catch {
      Stop-ProductionUpdate 'COMPOSE_CONFIG_JSON_INVALID'
    }
  }
  finally {
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-BestarCompose {
  param(
    [Parameter(Mandatory = $true)][string[]]$BaseArguments,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$FailureCode,
    [switch]$Capture
  )

  $allArguments = @($BaseArguments) + @($Arguments)
  Invoke-NativeChecked `
    -FilePath 'docker' `
    -Arguments $allArguments `
    -FailureCode $FailureCode `
    -Capture:$Capture
}

function Assert-NoPublishedPorts {
  param(
    [Parameter(Mandatory = $true)]$Config,
    [Parameter(Mandatory = $true)][string]$ServiceName
  )

  $service = $Config.services.PSObject.Properties[$ServiceName].Value
  $portsProperty = $service.PSObject.Properties['ports']
  if ($null -ne $portsProperty -and $null -ne $portsProperty.Value) {
    if (@($portsProperty.Value).Count -gt 0) {
      Stop-ProductionUpdate ("{0}_HOST_PORT" -f $ServiceName.ToUpperInvariant())
    }
  }
}

function Get-RedisQueueCount {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('LLEN', 'ZCARD')][string]$Operation,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$StateName
  )

  $output = Invoke-NativeChecked `
    -FilePath 'docker' `
    -Arguments @('exec', 'bestar_redis_local', 'redis-cli', $Operation, $Key) `
    -FailureCode 'REDIS_QUEUE_CHECK_FAILED' `
    -Capture
  $text = ($output | Out-String).Trim()
  $count = 0
  if (-not [int]::TryParse($text, [ref]$count)) {
    Stop-ProductionUpdate 'REDIS_QUEUE_RESULT_INVALID'
  }
  if ($count -ne 0) {
    Stop-ProductionUpdate ("REDIS_QUEUE_{0}_NOT_EMPTY" -f $StateName.ToUpperInvariant())
  }
  return $count
}

function Assert-ContainerHealth {
  $containers = @(
    'bestar_postgres_local',
    'bestar_redis_local',
    'bestar_api_local',
    'bestar_web_local',
    'bestar_worker_python_local',
    'bestar_nginx_local',
    'bestar_cloudflared_local'
  )

  foreach ($container in $containers) {
    $stateOutput = Invoke-NativeChecked `
      -FilePath 'docker' `
      -Arguments @(
        'inspect',
        '--format',
        '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}',
        $container
      ) `
      -FailureCode ("CONTAINER_{0}_MISSING" -f $container.ToUpperInvariant()) `
      -Capture
    $state = ($stateOutput | Out-String).Trim()
    $parts = $state.Split('|')
    if ($parts.Count -ne 3 -or $parts[0] -ne 'running' -or $parts[1] -ne 'healthy') {
      Stop-ProductionUpdate ("CONTAINER_{0}_UNHEALTHY" -f $container.ToUpperInvariant())
    }
    if ($container -eq 'bestar_api_local' -and $parts[2] -ne '0') {
      Stop-ProductionUpdate 'API_RESTART_COUNT_NONZERO'
    }
  }
}

function Assert-NoRuntimeHostPort {
  param(
    [Parameter(Mandatory = $true)][string]$Container,
    [Parameter(Mandatory = $true)][string]$Port
  )

  $output = Invoke-NativeChecked `
    -FilePath 'docker' `
    -Arguments @('inspect', '--format', '{{json .NetworkSettings.Ports}}', $Container) `
    -FailureCode ("{0}_PORT_CHECK_FAILED" -f $Container.ToUpperInvariant()) `
    -Capture
  try {
    $ports = (($output | Out-String).Trim() | ConvertFrom-Json)
  }
  catch {
    Stop-ProductionUpdate ("{0}_PORT_RESULT_INVALID" -f $Container.ToUpperInvariant())
  }
  $portProperty = $ports.PSObject.Properties[$Port]
  if ($null -ne $portProperty -and $null -ne $portProperty.Value) {
    Stop-ProductionUpdate ("{0}_HOST_PORT" -f $Container.ToUpperInvariant())
  }
}

if (-not $ValidateOnly -and -not $BusinessPaused) {
  Write-Host 'PRODUCTION_UPDATE_FAILED:BUSINESS_NOT_PAUSED' -ForegroundColor Red
  exit 1
}
if ($AllowDirtyWorktreeForValidation -and -not $ValidateOnly) {
  Write-Host 'PRODUCTION_UPDATE_FAILED:DIRTY_VALIDATION_SWITCH_REQUIRES_VALIDATE_ONLY' -ForegroundColor Red
  exit 1
}
if ($WaitTimeoutSeconds -lt 60 -or $WaitTimeoutSeconds -gt 1800) {
  Write-Host 'PRODUCTION_UPDATE_FAILED:WAIT_TIMEOUT_OUT_OF_RANGE' -ForegroundColor Red
  exit 1
}

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $scriptDirectory '..')).Path
$originalLocation = Get-Location
$databaseBackup = $null
$storageBackup = $null

try {
  Set-Location -LiteralPath $repositoryRoot
  Write-UpdateStep "repository=$repositoryRoot"

  foreach ($commandName in @('git', 'docker', 'curl.exe', 'powershell.exe')) {
    if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
      Stop-ProductionUpdate ("COMMAND_{0}_MISSING" -f $commandName.ToUpperInvariant())
    }
  }

  $dirtyLines = @(Invoke-NativeChecked -FilePath 'git' -Arguments @('status', '--porcelain') -FailureCode 'GIT_STATUS_FAILED' -Capture)
  if ($dirtyLines.Count -gt 0) {
    if ($ValidateOnly -and $AllowDirtyWorktreeForValidation) {
      Write-Host 'PRODUCTION_UPDATE_VALIDATION_WARNING:DIRTY_WORKTREE'
    }
    else {
      Stop-ProductionUpdate 'DIRTY_WORKTREE'
    }
  }

  $branch = ((Invoke-NativeChecked -FilePath 'git' -Arguments @('rev-parse', '--abbrev-ref', 'HEAD') -FailureCode 'GIT_BRANCH_FAILED' -Capture) | Out-String).Trim()
  if ($branch -ne 'main') {
    Stop-ProductionUpdate 'PRODUCTION_BRANCH_NOT_MAIN'
  }

  $upstream = ((Invoke-NativeChecked -FilePath 'git' -Arguments @('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}') -FailureCode 'GIT_UPSTREAM_MISSING' -Capture) | Out-String).Trim()
  $divergence = ((Invoke-NativeChecked -FilePath 'git' -Arguments @('rev-list', '--left-right', '--count', "HEAD...$upstream") -FailureCode 'GIT_DIVERGENCE_CHECK_FAILED' -Capture) | Out-String).Trim()
  if ($divergence -notmatch '^(\d+)\s+(\d+)$' -or $Matches[1] -ne '0' -or $Matches[2] -ne '0') {
    Stop-ProductionUpdate 'GIT_NOT_SYNCHRONIZED_WITH_UPSTREAM'
  }

  $headCommit = ((Invoke-NativeChecked -FilePath 'git' -Arguments @('rev-parse', '--short', 'HEAD') -FailureCode 'GIT_HEAD_FAILED' -Capture) | Out-String).Trim()
  Write-UpdateStep "commit=$headCommit branch=$branch upstream=$upstream"

  $envFile = Join-Path $repositoryRoot '.env'
  if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    Stop-ProductionUpdate 'ENV_FILE_MISSING'
  }
  $envValues = Read-DotEnvFile -Path $envFile
  $requiredKeys = @(
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'PUBLIC_DEPLOYMENT_ENABLED',
    'PUBLIC_BASE_URL',
    'CORS_ORIGINS',
    'BROWSER_COOKIE_SECURE',
    'TRUSTED_PROXY_MODE',
    'TRUSTED_PROXY_CIDRS',
    'AUTH_RATE_LIMIT_FAIL_CLOSED',
    'JWT_SECRET',
    'CLOUDFLARE_TUNNEL_TOKEN_FILE'
  )
  foreach ($key in $requiredKeys) {
    if (-not $envValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envValues[$key])) {
      Stop-ProductionUpdate ("ENV_{0}_MISSING" -f $key)
    }
  }
  if ($envValues['PUBLIC_DEPLOYMENT_ENABLED'] -ne 'true') {
    Stop-ProductionUpdate 'PUBLIC_DEPLOYMENT_NOT_ENABLED'
  }
  if ($envValues['BROWSER_COOKIE_SECURE'] -ne 'true') {
    Stop-ProductionUpdate 'SECURE_BROWSER_COOKIE_NOT_ENABLED'
  }
  if ($envValues['AUTH_RATE_LIMIT_FAIL_CLOSED'] -ne 'true') {
    Stop-ProductionUpdate 'AUTH_RATE_LIMIT_NOT_FAIL_CLOSED'
  }
  if ($envValues['TRUSTED_PROXY_MODE'] -ne 'cloudflare-tunnel') {
    Stop-ProductionUpdate 'TRUSTED_PROXY_MODE_INVALID'
  }
  if ($envValues['JWT_SECRET'].Length -lt 32) {
    Stop-ProductionUpdate 'JWT_SECRET_TOO_SHORT'
  }
  if (
    $envValues['PUBLIC_BASE_URL'] -notmatch '^https://[^*]+$' -or
    $envValues['CORS_ORIGINS'] -ne $envValues['PUBLIC_BASE_URL']
  ) {
    Stop-ProductionUpdate 'PUBLIC_ORIGIN_INVALID'
  }
  foreach ($ignoredPath in @('.env', '.secrets/cloudflare-tunnel-token')) {
    & git check-ignore -q -- $ignoredPath
    if ($LASTEXITCODE -ne 0) {
      Stop-ProductionUpdate 'SECRET_PATH_NOT_GIT_IGNORED'
    }
  }

  $composeBaseArguments = @(
    'compose',
    '--env-file', $envFile,
    '-f', (Join-Path $repositoryRoot 'infra\docker\compose.local.yml'),
    '-f', (Join-Path $repositoryRoot 'infra\docker\compose.public.yml'),
    '-f', (Join-Path $repositoryRoot 'infra\docker\compose.cloudflare-tunnel.yml')
  )
  $composeConfig = Get-ComposeConfig -BaseArguments $composeBaseArguments
  $expectedServices = @('postgres', 'redis', 'api', 'web', 'worker-python', 'nginx', 'cloudflared')
  $actualServices = @($composeConfig.services.PSObject.Properties.Name)
  foreach ($serviceName in $expectedServices) {
    if ($actualServices -notcontains $serviceName) {
      Stop-ProductionUpdate ("COMPOSE_SERVICE_{0}_MISSING" -f $serviceName.ToUpperInvariant())
    }
  }
  foreach ($serviceName in @('postgres', 'redis', 'api', 'cloudflared')) {
    Assert-NoPublishedPorts -Config $composeConfig -ServiceName $serviceName
  }
  if ($composeConfig.services.api.environment.PUBLIC_DEPLOYMENT_ENABLED -ne 'true') {
    Stop-ProductionUpdate 'COMPOSE_PUBLIC_DEPLOYMENT_DISABLED'
  }
  if ($composeConfig.services.api.environment.PUBLIC_BASE_URL -ne $envValues['PUBLIC_BASE_URL']) {
    Stop-ProductionUpdate 'COMPOSE_PUBLIC_BASE_URL_MISMATCH'
  }

  $tokenPath = $composeConfig.secrets.cloudflare_tunnel_token.file
  if (-not [System.IO.Path]::IsPathRooted($tokenPath)) {
    $tokenPath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $tokenPath))
  }
  if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) {
    Stop-ProductionUpdate 'TOKEN_FILE_MISSING'
  }
  $tokenText = [System.IO.File]::ReadAllText($tokenPath).Trim()
  if ($tokenText.Length -lt 80 -or $tokenText.Length -gt 4096 -or $tokenText -notmatch '^eyJ[A-Za-z0-9._=-]+$') {
    Stop-ProductionUpdate 'TOKEN_FILE_INVALID'
  }
  $aclScript = Join-Path $repositoryRoot 'scripts\verify-windows-secret-file-acl.ps1'
  Invoke-NativeChecked `
    -FilePath 'powershell.exe' `
    -Arguments @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $aclScript, '-TokenPath', $tokenPath) `
    -FailureCode 'TOKEN_FILE_PERMISSIONS'

  Write-UpdateStep 'checking BullMQ live states'
  $queuePrefix = 'bull:bestar-async-jobs'
  [void](Get-RedisQueueCount -Operation 'LLEN' -Key "${queuePrefix}:active" -StateName 'active')
  [void](Get-RedisQueueCount -Operation 'LLEN' -Key "${queuePrefix}:wait" -StateName 'wait')
  [void](Get-RedisQueueCount -Operation 'LLEN' -Key "${queuePrefix}:paused" -StateName 'paused')
  [void](Get-RedisQueueCount -Operation 'ZCARD' -Key "${queuePrefix}:delayed" -StateName 'delayed')
  [void](Get-RedisQueueCount -Operation 'ZCARD' -Key "${queuePrefix}:prioritized" -StateName 'prioritized')
  [void](Get-RedisQueueCount -Operation 'ZCARD' -Key "${queuePrefix}:waiting-children" -StateName 'waiting_children')

  $gitBash = Get-GitBashPath
  foreach ($backupScript in @('scripts\backup-postgres.sh', 'scripts\backup-storage.sh')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot $backupScript) -PathType Leaf)) {
      Stop-ProductionUpdate 'BACKUP_SCRIPT_MISSING'
    }
  }

  if ($ValidateOnly) {
    Assert-ContainerHealth
    Assert-NoRuntimeHostPort -Container 'bestar_postgres_local' -Port '5432/tcp'
    Assert-NoRuntimeHostPort -Container 'bestar_redis_local' -Port '6379/tcp'
    if (-not (Test-Path -LiteralPath $BackupDirectory -PathType Container)) {
      Stop-ProductionUpdate 'BACKUP_DIRECTORY_MISSING'
    }
    $resolvedValidationBackup = (Resolve-Path -LiteralPath $BackupDirectory).Path
    $bashValidationBackup = ((Invoke-NativeChecked `
        -FilePath $gitBash `
        -Arguments @('-c', 'cygpath -u -- "$1"', '_', $resolvedValidationBackup) `
        -FailureCode 'BACKUP_PATH_CONVERSION_FAILED' `
        -Capture) | Out-String).Trim()
    if (-not $bashValidationBackup.StartsWith('/')) {
      Stop-ProductionUpdate 'BACKUP_PATH_CONVERSION_INVALID'
    }
    Write-Host 'PRODUCTION_UPDATE_VALIDATION:PASS'
    exit 0
  }

  if (-not (Test-Path -LiteralPath $BackupDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
  }
  $resolvedBackupDirectory = (Resolve-Path -LiteralPath $BackupDirectory).Path
  $bashBackupDirectory = ((Invoke-NativeChecked `
      -FilePath $gitBash `
      -Arguments @('-c', 'cygpath -u -- "$1"', '_', $resolvedBackupDirectory) `
      -FailureCode 'BACKUP_PATH_CONVERSION_FAILED' `
      -Capture) | Out-String).Trim()
  $backupStartedAt = Get-Date
  $previousBackupDirectory = $env:BACKUP_DIR
  try {
    $env:BACKUP_DIR = $bashBackupDirectory
    Write-UpdateStep 'creating PostgreSQL backup'
    Invoke-NativeChecked -FilePath $gitBash -Arguments @('scripts/backup-postgres.sh') -FailureCode 'POSTGRES_BACKUP_FAILED'
    Write-UpdateStep 'creating storage backup'
    Invoke-NativeChecked -FilePath $gitBash -Arguments @('scripts/backup-storage.sh') -FailureCode 'STORAGE_BACKUP_FAILED'
  }
  finally {
    if ($null -eq $previousBackupDirectory) {
      Remove-Item Env:BACKUP_DIR -ErrorAction SilentlyContinue
    }
    else {
      $env:BACKUP_DIR = $previousBackupDirectory
    }
  }

  $databaseBackup = Get-ChildItem -LiteralPath $resolvedBackupDirectory -Filter 'postgres-*.sql' -File |
    Where-Object { $_.LastWriteTime -ge $backupStartedAt.AddSeconds(-2) } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $storageBackup = Get-ChildItem -LiteralPath $resolvedBackupDirectory -Filter 'storage-*.tar.gz' -File |
    Where-Object { $_.LastWriteTime -ge $backupStartedAt.AddSeconds(-2) } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($null -eq $databaseBackup -or $databaseBackup.Length -le 0) {
    Stop-ProductionUpdate 'POSTGRES_BACKUP_MISSING'
  }
  if ($null -eq $storageBackup -or $storageBackup.Length -le 0) {
    Stop-ProductionUpdate 'STORAGE_BACKUP_MISSING'
  }
  $databaseHeader = Get-Content -LiteralPath $databaseBackup.FullName -TotalCount 5 -Encoding UTF8
  if (-not ($databaseHeader -match 'PostgreSQL database dump')) {
    Stop-ProductionUpdate 'POSTGRES_BACKUP_HEADER_INVALID'
  }
  $bashStorageBackup = ((Invoke-NativeChecked `
      -FilePath $gitBash `
      -Arguments @('-c', 'cygpath -u -- "$1"', '_', $storageBackup.FullName) `
      -FailureCode 'STORAGE_BACKUP_PATH_CONVERSION_FAILED' `
      -Capture) | Out-String).Trim()
  Invoke-NativeChecked `
    -FilePath $gitBash `
    -Arguments @('-c', 'tar -tzf "$1" >/dev/null', '_', $bashStorageBackup) `
    -FailureCode 'STORAGE_BACKUP_ARCHIVE_INVALID'

  Write-UpdateStep 'building api, web, and worker-python images before downtime'
  Invoke-BestarCompose `
    -BaseArguments $composeBaseArguments `
    -Arguments @('--profile', 'public-tunnel', 'build', 'api', 'web', 'worker-python') `
    -FailureCode 'IMAGE_BUILD_FAILED'

  $updateStartedAt = Get-Date
  Write-UpdateStep 'stopping public ingress and application containers'
  Invoke-BestarCompose `
    -BaseArguments $composeBaseArguments `
    -Arguments @('--profile', 'public-tunnel', 'stop', 'cloudflared', 'nginx', 'web', 'api') `
    -FailureCode 'APPLICATION_STOP_FAILED'

  Write-UpdateStep 'starting the production stack with the verified configuration'
  Invoke-BestarCompose `
    -BaseArguments $composeBaseArguments `
    -Arguments @(
      '--profile', 'public-tunnel',
      'up', '-d', '--no-build', '--wait', '--wait-timeout', $WaitTimeoutSeconds.ToString()
    ) `
    -FailureCode 'STACK_START_FAILED'

  Assert-ContainerHealth
  Assert-NoRuntimeHostPort -Container 'bestar_postgres_local' -Port '5432/tcp'
  Assert-NoRuntimeHostPort -Container 'bestar_redis_local' -Port '6379/tcp'

  $apiLogs = Invoke-NativeChecked `
    -FilePath 'docker' `
    -Arguments @('logs', '--since', $updateStartedAt.ToUniversalTime().ToString('o'), 'bestar_api_local') `
    -FailureCode 'API_LOG_CHECK_FAILED' `
    -Capture
  if (($apiLogs | Out-String) -match 'P1000|P3009|P3018|"level":"error"|Unhandled|FATAL') {
    Stop-ProductionUpdate 'API_STARTUP_ERROR_FOUND'
  }

  Write-UpdateStep 'checking Prisma migrations'
  Invoke-BestarCompose `
    -BaseArguments $composeBaseArguments `
    -Arguments @('--profile', 'public-tunnel', 'exec', '-T', 'api', 'pnpm', '--filter', 'api', 'prisma', 'migrate', 'status') `
    -FailureCode 'PRISMA_MIGRATION_STATUS_FAILED'

  Write-UpdateStep 'running full local healthcheck'
  Invoke-NativeChecked `
    -FilePath $gitBash `
    -Arguments @('scripts/healthcheck.sh') `
    -FailureCode 'HEALTHCHECK_FAILED'

  Write-UpdateStep 'probing the Tunnel origin network'
  Invoke-BestarCompose `
    -BaseArguments $composeBaseArguments `
    -Arguments @('--profile', 'public-tunnel-test', 'run', '--rm', '--no-deps', 'tunnel-origin-probe') `
    -FailureCode 'TUNNEL_ORIGIN_PROBE_FAILED'

  $publicUrl = $envValues['PUBLIC_BASE_URL'].TrimEnd('/') + '/'
  $httpCode = ((Invoke-NativeChecked `
      -FilePath 'curl.exe' `
      -Arguments @('-sS', '-o', 'NUL', '--max-time', '20', '-w', '%{http_code}', $publicUrl) `
      -FailureCode 'PUBLIC_HTTPS_CHECK_FAILED' `
      -Capture) | Out-String).Trim()
  if ($httpCode -notmatch '^[23]\d\d$') {
    Stop-ProductionUpdate 'PUBLIC_HTTPS_STATUS_INVALID'
  }

  Write-Host 'PRODUCTION_UPDATE:PASS'
  Write-Host "commit=$headCommit"
  Write-Host "postgres_backup=$($databaseBackup.FullName)"
  Write-Host "storage_backup=$($storageBackup.FullName)"
  Write-Host "public_http_status=$httpCode"
}
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($null -ne $databaseBackup) {
    Write-Host "postgres_backup=$($databaseBackup.FullName)"
  }
  if ($null -ne $storageBackup) {
    Write-Host "storage_backup=$($storageBackup.FullName)"
  }
  Write-Host 'Keep business operations paused. Inspect Docker status and the first failing service before retrying.'
  exit 1
}
finally {
  Set-Location -LiteralPath $originalLocation
}
