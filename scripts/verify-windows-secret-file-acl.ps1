[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TokenPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $TokenPath -PathType Leaf)) {
  exit 1
}

$acl = Get-Acl -LiteralPath $TokenPath
if (-not $acl.AreAccessRulesProtected) {
  exit 1
}

$broadSids = @(
  'S-1-1-0',
  'S-1-5-11',
  'S-1-5-32-545'
)

$allowRuleCount = 0
foreach ($rule in $acl.Access) {
  if ($rule.AccessControlType -ne 'Allow') {
    continue
  }

  $allowRuleCount += 1
  try {
    $sid = $rule.IdentityReference.Translate(
      [System.Security.Principal.SecurityIdentifier]
    ).Value
  }
  catch {
    exit 1
  }

  $identity = $rule.IdentityReference.Value
  if (
    $broadSids -contains $sid -or
    $identity -match '(^|\\)(Users|Authenticated Users|Everyone|CodexSandboxUsers)$'
  ) {
    exit 1
  }
}

if ($allowRuleCount -eq 0) {
  exit 1
}

Write-Output 'Windows secret-file ACL: PASS'
