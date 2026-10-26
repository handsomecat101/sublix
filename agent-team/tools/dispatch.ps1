# Giao 1 việc cho thợ KHÔNG được Orca tự nhận diện (mcode, CommandCode, OpenCode, agy…).
# Dùng: powershell -File agent-team\tools\dispatch.ps1 -Run <run_id> -Terminal <handle> -Id TSK-XYZ -Spec <file_spec.md>
# Tạo task Orca → dispatch lấy preamble (hướng dẫn báo worker_done) → ghép với spec → gõ 1 dòng vào terminal thợ.
param(
  [Parameter(Mandatory)] [string]$Run,
  [Parameter(Mandatory)] [string]$Terminal,
  [Parameter(Mandatory)] [string]$Id,
  [Parameter(Mandatory)] [string]$Spec
)
$specText = [IO.File]::ReadAllText((Resolve-Path $Spec))
$t = orca orchestration task-create --run $Run --spec $Id --json 2>$null | ConvertFrom-Json
if (-not $t.result.task.id) { throw "task-create lỗi" }
$d = orca orchestration dispatch --run $Run --task $t.result.task.id --to $Terminal --return-preamble --json 2>$null | ConvertFrom-Json
if (-not $d.result.preamble) { throw "dispatch lỗi (terminal còn dispatch cũ chưa xong?)" }
$out = Join-Path (Split-Path (Resolve-Path $Spec)) "$Id`_task.md"
[IO.File]::WriteAllText($out, $d.result.preamble + "`n`n" + $specText, [Text.UTF8Encoding]::new($false))
orca terminal send --terminal $Terminal --text "Viec moi tu nguoi dieu phoi: doc file $out va thuc hien dung nhu trong do." --enter 2>$null | Out-Null
"task=$($t.result.task.id) dispatch=$($d.result.dispatch.id) file=$out"
