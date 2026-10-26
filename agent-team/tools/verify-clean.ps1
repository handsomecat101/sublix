# Kiểm chứng trên BẢN SAO SẠCH của git index (chỉ những gì đã `git add`).
# Dùng: powershell -NoProfile -ExecutionPolicy Bypass -File agent-team\tools\verify-clean.ps1 [-Rust] [-NoFrontend]
# In ra exit code từng bước; commit CHỈ khi mọi dòng = 0.
param([switch]$Rust, [switch]$NoFrontend)
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'   # PowerShell con không có cargo trong PATH
$env:PATH = (Join-Path $env:USERPROFILE '.cargo\bin') + ';' + $env:PATH
$d = Join-Path $env:TEMP 'sublix-verify-clean'
$nm = Join-Path $d 'node_modules'
if (Test-Path $nm) { [IO.Directory]::Delete($nm) }          # gỡ junction TRƯỚC, kẻo xoá node_modules thật
if (Test-Path $d) { [IO.Directory]::Delete($d, $true) }
Set-Location $repo
git checkout-index -a --prefix="$d/"
$res = [ordered]@{}
if (-not $NoFrontend) {
  New-Item -ItemType Junction -Path $nm -Target (Join-Path $repo 'node_modules') | Out-Null
  Set-Location $d
  $res.tsc = -1; $res.vite = -1; $res.node = -1; $res.version = -1
  npx tsc --noEmit *> "$env:TEMP\vc_tsc.log"; $res.tsc = $LASTEXITCODE
  npx vite build *> "$env:TEMP\vc_vite.log"; $res.vite = $LASTEXITCODE
  $tests = Get-ChildItem scripts -Directory -Filter '*-tests' | ForEach-Object { Get-ChildItem $_.FullName -Filter '*.test.ts' } | ForEach-Object { $_.FullName }
  node --test $tests *> "$env:TEMP\vc_node.log"; $res.node = $LASTEXITCODE
  npm run verify:version *> "$env:TEMP\vc_ver.log"; $res.version = $LASTEXITCODE
}
if ($Rust) {
  $env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'sublix-cc-target'   # dùng chung target ⇒ ít bị Smart App Control chặn
  Set-Location (Join-Path $d 'src-tauri')
  $res.cargo = -1; $res.examples = -1
  & $cargo test --lib *> "$env:TEMP\vc_cargo.log"; $res.cargo = $LASTEXITCODE
  & $cargo build --examples *> "$env:TEMP\vc_ex.log"; $res.examples = $LASTEXITCODE
}
Set-Location $repo
if (Test-Path $nm) { [IO.Directory]::Delete($nm) }
[IO.Directory]::Delete($d, $true)
$res.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
if (Test-Path "$env:TEMP\vc_node.log") { Select-String -Path "$env:TEMP\vc_node.log" -Pattern '^. (tests|pass|fail) ' -Encoding utf8 | ForEach-Object { $_.Line } }
if ($Rust) {
  Select-String -Path "$env:TEMP\vc_cargo.log" -Pattern '^test result|\.\.\. FAILED|os error 4551' | ForEach-Object { $_.Line }
  # 4551 = Smart App Control chặn exe vừa build ⇒ chờ 4–7 phút rồi chạy lại (không tắt SAC).
}
