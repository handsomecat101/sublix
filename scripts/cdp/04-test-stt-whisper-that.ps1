$ErrorActionPreference = 'Continue'
$tmp = "$env:TEMP\sublix-stt-test"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# 1) Sinh WAV giong noi bang Windows SAPI TTS
$wavRaw = Join-Path $tmp 'speech_raw.wav'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name); "VOICE: $($voice.VoiceInfo.Name)" } else { "khong co voice en-US, dung mac dinh" }
$synth.SetOutputToWaveFile($wavRaw)
$synth.Speak('Good evening everyone. Today we are testing the subtitle pipeline of Sublix Studio.')
$synth.SetOutputToNull()
$synth.Dispose()

# 2) Resample 16kHz mono PCM16 (whisper.cpp yeu cau)
$wav16 = Join-Path $tmp 'speech_16k.wav'
& ffmpeg -y -hide_banner -loglevel error -i $wavRaw -ar 16000 -ac 1 -c:a pcm_s16le $wav16 2>&1 | Out-String
"16kHz WAV: $([math]::Round((Get-Item $wav16).Length/1KB,1)) KB"

# 3) Chay whisper-cli.exe voi model ggml-base.bin
$exe = 'C:\AI Project\Sublix\src-tauri\binaries\Release\whisper-cli.exe'
$model = 'C:\AI Project\Sublix\src-tauri\models\ggml-base.bin'
Write-Output "=== whisper-cli (CPU) chay voi ggml-base.bin ==="
$sw = [Diagnostics.Stopwatch]::StartNew()
& $exe -m $model -f $wav16 -l en -nt -np 2>&1 | Out-String
$sw.Stop()
"THOI GIAN: $([math]::Round($sw.Elapsed.TotalSeconds,1))s"
