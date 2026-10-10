param([string]$Task = 'showcase:dev')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$portableNode = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($portableNode) { $env:PATH = $portableNode.FullName + ';' + $env:PATH }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Установите Node.js 24 LTS или поместите переносимую сборку в .tools.' }
& npm.cmd run $Task
exit $LASTEXITCODE
