$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$audioDirectory = Join-Path $repoPath 'apps\showcase\public\audio'
New-Item -ItemType Directory -Force -Path $audioDirectory | Out-Null
Add-Type -AssemblyName System.Speech
$voice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$voice.SelectVoice('Microsoft Irina Desktop')
$voice.Rate = -3
$voice.Volume = 100
$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$stories = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $repoPath 'content\oge-original-summary.json') | ConvertFrom-Json
try {
  foreach ($story in $stories) {
    $outputPath = Join-Path $audioDirectory ('oge-' + $story.id + '.wav')
    $voice.SetOutputToWaveFile($outputPath, $format)
    $voice.Speak(($story.paragraphs -join [Environment]::NewLine))
    $voice.SetOutputToNull()
    Write-Output ($story.id + ': WAV created')
  }
} finally { $voice.Dispose() }
