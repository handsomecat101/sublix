# Chạy app THẬT để kiểm giao diện dù Smart App Control chặn exe mới build.
# Cách: exe CŨ đã từng chạy được + Vite từ working tree (exe nạp devUrl localhost:1420 ⇒ thấy giao diện mới nhất).
#   powershell -File agent-team\tools\gui-app.ps1 start    # mở, CDP ở cổng 9226
#   node agent-team\tools\gui-studio-tabs.cjs 9226 out.png # (hoặc script CDP của bạn)
#   powershell -File agent-team\tools\gui-app.ps1 stop     # chỉ tắt PID mình tạo
# Giới hạn: lệnh backend mới hơn exe thì không có; app dùng config THẬT của PO (không bấm Lưu / ô key);
# đổi khoá localStorage ⇒ sao lưu trước. Cổng 1420 phải trống (app dev của PO cũng dùng 1420).
param([Parameter(Mandatory)][ValidateSet('start','stop')] [string]$Action,
      [string]$Exe = (Join-Path $env:TEMP 'sublix-cc-target\debug\sublix.exe'),
      [int]$CdpPort = 9226)
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pidFile = Join-Path $env:TEMP 'sublix-gui-app.pids'
if ($Action -eq 'start') {
  if (Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue) { throw "Cổng 1420 đang bận (app dev của PO?) — không chạy đè." }
  $v = Start-Process -FilePath node -ArgumentList 'node_modules/vite/bin/vite.js','--port','1420','--strictPort' -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput "$env:TEMP\gui-vite.out" -RedirectStandardError "$env:TEMP\gui-vite.err"
  Start-Sleep 8
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$CdpPort"
  $a = Start-Process -FilePath $Exe -PassThru
  "$($v.Id) $($a.Id)" | Out-File $pidFile -Encoding ascii
  "vite=$($v.Id) app=$($a.Id) cdp=$CdpPort"
} else {
  if (-not (Test-Path $pidFile)) { "khong co pid file"; return }
  $ids = (Get-Content $pidFile).Trim() -split ' '
  Stop-Process -Id ([int]$ids[1]) -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$([int]$ids[0])" | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
  Stop-Process -Id ([int]$ids[0]) -ErrorAction SilentlyContinue
  Remove-Item $pidFile
  "stopped vite=$($ids[0]) app=$($ids[1])"
}
