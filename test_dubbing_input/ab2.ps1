param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Remaining)

# Optional leading switch: -fresh  => kill stale agent-browser daemons first (use before connect)
$fresh = $false
if ($Remaining.Count -gt 0 -and $Remaining[0] -eq '-fresh') {
    $fresh = $true
    if ($Remaining.Count -gt 1) { $Remaining = $Remaining[1..($Remaining.Count - 1)] } else { $Remaining = @() }
}

# FORK copy: session name rieng de khong lam vao app goc (session 'sublixgui' cua ban goc)
$exe = 'C:\Users\TTC\AppData\Roaming\npm\node_modules\agent-browser\bin\agent-browser-win32-x64.exe'
$out = Join-Path $env:TEMP 'ab_out_fork.txt'
$err = Join-Path $env:TEMP 'ab_err_fork.txt'
Remove-Item $out, $err -ErrorAction SilentlyContinue

if ($fresh) {
    Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'agent-browser' } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400
}

$argList = @('--session', 'sublixfork') + $Remaining
$p = Start-Process -FilePath $exe -ArgumentList $argList -PassThru -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err

$finished = $p.WaitForExit(45000)
if (-not $finished) {
    try { $p.Kill() } catch {}
    Write-Output '___AB_TIMEOUT___'
}

if (Test-Path $out) { Get-Content $out -Raw -Encoding UTF8 }
if (Test-Path $err) {
    $e2 = Get-Content $err -Raw -Encoding UTF8
    if ($e2 -and $e2.Trim() -and ($e2.Trim() -notmatch '^\[agent-browser\] launched browser$')) { Write-Output "STDERR: $e2" }
}
