param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArguments)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$ghPath = Join-Path $projectRoot '.tools/gh/bin/gh.exe'
if (-not (Test-Path -LiteralPath $ghPath)) { $ghPath = (Get-Command gh -ErrorAction Stop).Source }
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'
if (-not $env:GH_TOKEN) {
  $credentialLines = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Авторизация Git недоступна. Выполните gh auth login.' }
  $passwordLine = $credentialLines | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
  if (-not $passwordLine) { throw 'Git Credential Manager не вернул учётные данные.' }
  $env:GH_TOKEN = $passwordLine.Substring(9)
  $credentialLines = $null
  $passwordLine = $null
}
& $ghPath @CliArguments
exit $LASTEXITCODE
