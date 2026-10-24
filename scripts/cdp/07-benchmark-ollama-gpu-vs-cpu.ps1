param([string]$Model = 'qwen2.5:3b', [string]$Prompt = 'Dịch sang tiếng Việt, chỉ trả về bản dịch: "I can tell you right now that this will not end well for any of us."')
$ErrorActionPreference = 'Continue'

$body = @{
  model = $Model
  stream = $false
  prompt = $Prompt
  options = @{ num_predict = 128; num_ctx = 4096 }
} | ConvertTo-Json -Depth 6

$sw = [Diagnostics.Stopwatch]::StartNew()
$r = Invoke-RestMethod -Uri 'http://localhost:11434/api/generate' -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 600
$sw.Stop()

$genS  = $r.total_duration / 1e9
$loadS = $r.load_duration / 1e9
$promptS = $r.prompt_eval_duration / 1e9
$nGen = $r.eval_count
$nPrompt = $r.prompt_eval_count

Write-Output "=== OLLAMA BENCH :: $Model ==="
Write-Output ("LOAD       : {0:N1}s" -f $loadS)
Write-Output ("PROMPT EVAL: {0} tok in {1:N2}s = {2:N1} tok/s" -f $nPrompt, $promptS, ($nPrompt / [Math]::Max($promptS, 0.0001)))
Write-Output ("GENERATE   : {0} tok in {1:N2}s = {2:N1} tok/s" -f $nGen, $genS, ($nGen / [Math]::Max($genS, 0.0001)))
Write-Output ("TOTAL WALL : {0:N1}s" -f $sw.Elapsed.TotalSeconds)
Write-Output ("OUTPUT     : {0}" -f $r.response.Trim())

Write-Output ""
Write-Output "=== GPU offload (ollama ps) ==="
& ollama ps 2>&1 | Out-String
