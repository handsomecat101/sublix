# ==============================================================================
# check_version.ps1 - Sublix version guard (Windows / PowerShell 5.1)
#
# Quet 4 nguon version + 2 tieu de cua so native cua app, so sanh tat ca voi
# version chuan lay tu package.json; THEM 1 muc quet "lop drift thu 5":
# version bi HARDCODE trong ma nguon UI (src/**.ts, src/**.tsx).
#   - Tat ca khop  -> in "PASS: ..." va exit code 0
#   - Bat ky lech  -> in dong bi lech voi tien to "[LECH]", in tong ket va exit code 1
#
# ASCII-only (khong dau) de chay on dinh tren PowerShell 5.1 khi file duoc ghi
# bang -Encoding UTF8 (tranh mojibake). File nay luu UTF-8 KHONG BOM, LF.
#
# Chay:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_version.ps1
#   npm run verify:version
# ==============================================================================

$ErrorActionPreference = 'Stop'

# Thu muc goc duoc xac dinh tu vi tri file script (chay duoc tu bat ky thu muc nao)
if ($PSScriptRoot) {
    $root = Split-Path -Parent $PSScriptRoot
} else {
    $root = Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Get-FileText([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    return [System.IO.File]::ReadAllText($path)
}

function Get-JsonVersion([string]$text) {
    if (-not $text) { return $null }
    $m = [regex]::Match($text, '"version"\s*:\s*"([^"]+)"')
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

function Get-CargoPackageVersion([string]$text) {
    if (-not $text) { return $null }
    # Chi lay phan [package] (dung truoc section header tiep theo) de tranh
    # nham voi cac truong "version" cua dependencies.
    $sec = [regex]::Match($text, '(?s)^\[package\]([^\[]*)')
    if (-not $sec.Success) { return $null }
    $m = [regex]::Match($sec.Groups[1].Value, '(?m)^\s*version\s*=\s*"([^"]+)"')
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

function Get-TitleVersion([string]$title) {
    if (-not $title) { return $null }
    $m = [regex]::Match($title, 'v(\d+\.\d+\.\d+)')
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

# --- Lop drift thu 5: quet version hardcode trong ma nguon UI ---

# Tra ve noi dung file DA LOAI BO COMMENT (comment -> khoang trang, giu nguyen
# so dong de map ve line number). Biet "string" khi quet nen chuoi trong
# string literal khong bi cat nham.
function Get-CodeOnlyText([string]$path) {
    $text = [System.IO.File]::ReadAllText($path)
    $chars = $text.ToCharArray()
    $sb = New-Object System.Text.StringBuilder
    $n = $chars.Length
    $i = 0
    $inBlock = $false
    $inStr = [char]0
    while ($i -lt $n) {
        $c = $chars[$i]
        if ($inBlock) {
            if ($c -eq '*' -and ($i + 1) -lt $n -and $chars[$i + 1] -eq '/') {
                [void]$sb.Append('  '); $i = $i + 2; $inBlock = $false; continue
            }
            if ($c -eq "`n" -or $c -eq "`r") { [void]$sb.Append($c) } else { [void]$sb.Append(' ') }
            $i = $i + 1; continue
        }
        if ($inStr -ne [char]0) {
            [void]$sb.Append($c)
            if ($c -eq '\' -and ($i + 1) -lt $n) {
                [void]$sb.Append($chars[$i + 1]); $i = $i + 2; continue
            }
            if ($c -eq $inStr) { $inStr = [char]0 }
            $i = $i + 1; continue
        }
        if ($c -eq '"' -or $c -eq "'" -or $c -eq '`') {
            $inStr = $c; [void]$sb.Append($c); $i = $i + 1; continue
        }
        if ($c -eq '/' -and ($i + 1) -lt $n -and $chars[$i + 1] -eq '/') {
            while ($i -lt $n -and $chars[$i] -ne "`n") { [void]$sb.Append(' '); $i = $i + 1 }
            continue
        }
        if ($c -eq '/' -and ($i + 1) -lt $n -and $chars[$i + 1] -eq '*') {
            $inBlock = $true; [void]$sb.Append('  '); $i = $i + 2; continue
        }
        [void]$sb.Append($c); $i = $i + 1
    }
    return $sb.ToString()
}

function Get-RelPath([string]$base, [string]$full) {
    $b = $base.TrimEnd('\', '/')
    if ($full.StartsWith($b)) { return $full.Substring($b.Length).TrimStart('\', '/') -replace '\\', '/' }
    return $full
}

# Output chi dung ASCII de khong bao gi mojibake tren console PowerShell 5.1
function Format-Ascii([string]$text) {
    if ($null -eq $text) { return '' }
    return [regex]::Replace($text, '[^\x20-\x7E]', '.')
}

# Tim version hardcode trong JSX text / thuoc tinh (chuoi literal "0.11.x").
# BO QUA: comment (da cat), file ChangelogModal.tsx (du lieu lich su phien ban).
function Find-HardcodedVersionInSrc([string]$base) {
    $hits = @()
    $srcDir = Join-Path $base 'src'
    if (-not (Test-Path -LiteralPath $srcDir)) { return $hits }
    $files = Get-ChildItem -LiteralPath $srcDir -Recurse -File |
        Where-Object { ($_.Extension -eq '.ts' -or $_.Extension -eq '.tsx') -and $_.FullName -notmatch 'node_modules' }
    foreach ($f in $files) {
        $rel = Get-RelPath $base $f.FullName
        if ($rel -like '*ChangelogModal.tsx') { continue }
        $code = Get-CodeOnlyText $f.FullName
        if (-not $code) { continue }
        $lines = $code -split "`r`n|`n"
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $line = $lines[$i]
            $hit = $false
            # JSX text: >v0.11.33< (co '>' truoc va '<' sau)
            if ($line -match '>v?0\.11\.\d+\s*<') { $hit = $true }
            # Chuoi literal dung rieng: "0.11.29" / 'v0.11.33' / `v0.11.33`
            if (-not $hit -and $line -match '["\x27\x60]v?0\.11\.\d+["\x27\x60]') { $hit = $true }
            if ($hit) {
                $snippet = $line.Trim()
                if ($snippet.Length -gt 110) { $snippet = $snippet.Substring(0, 110) + '...' }
                $hits = $hits + ($rel + ':' + ($i + 1) + ': ' + (Format-Ascii $snippet))
            }
        }
    }
    return $hits
}

# --- Version chuan: package.json ---
$pkgPath = Join-Path $root 'package.json'
$canonical = Get-JsonVersion (Get-FileText $pkgPath)
if (-not $canonical) {
    Write-Host ('[LOI] khong doc duoc version chuan tu package.json: ' + $pkgPath)
    exit 1
}

# --- src-tauri/Cargo.toml ---
$cargoPath = Join-Path (Join-Path $root 'src-tauri') 'Cargo.toml'
$cargoVersion = Get-CargoPackageVersion (Get-FileText $cargoPath)

# --- src-tauri/tauri.conf.json (version + 2 tieu de cua so) ---
$tauriPath = Join-Path (Join-Path $root 'src-tauri') 'tauri.conf.json'
$tauriText = Get-FileText $tauriPath
$tauriVersion = $null
$mainTitle = $null
$overlayTitle = $null
if ($tauriText) {
    try {
        $cfg = ConvertFrom-Json -InputObject $tauriText
        $tauriVersion = $cfg.version
        foreach ($w in $cfg.app.windows) {
            if ($w.label -eq 'main') { $mainTitle = $w.title }
            elseif ($w.label -eq 'overlay') { $overlayTitle = $w.title }
        }
    } catch {
        Write-Host ('[LOI] khong parse duoc tauri.conf.json: ' + $_.Exception.Message)
        exit 1
    }
}

# --- Bang trang thai ---
$rows = @(
    @{ Label = 'package.json';              Value = $canonical;                 Pad = 31; Note = $null },
    @{ Label = 'src-tauri/Cargo.toml';       Value = $cargoVersion;              Pad = 31; Note = $null },
    @{ Label = 'src-tauri/tauri.conf.json';  Value = $tauriVersion;              Pad = 31; Note = $null },
    @{ Label = 'tieu de cua so chinh';       Value = (Get-TitleVersion $mainTitle);    Pad = 32; Note = $canonical },
    @{ Label = 'tieu de cua so overlay';     Value = (Get-TitleVersion $overlayTitle); Pad = 32; Note = $canonical }
)

Write-Host ('--- Sublix version check (chuan = ' + $canonical + ') ---')

$failCount = 0
$failList = @()

foreach ($r in $rows) {
    $value = $r.Value
    if ($null -eq $value -or $value -eq '') { $value = '(khong doc duoc)' }
    $status = '[OK  ]'
    if ($value -ne $canonical) {
        $status = '[LECH]'
        $failCount = $failCount + 1
        $failList = $failList + $r.Label
    }
    $line = $status + ' ' + $r.Label.PadRight($r.Pad) + $value
    if ($r.Note -or $status -eq '[LECH]') {
        $line = $line + '  (can bang ' + $canonical + ')'
    }
    Write-Host $line
}

# --- Muc 6: version hardcode trong ma nguon UI (lop drift thu 5) ---
$srcLabel = 'hardcode version trong src/'
$srcHits = @(Find-HardcodedVersionInSrc $root)
if ($srcHits.Count -eq 0) {
    Write-Host ('[OK  ] ' + $srcLabel.PadRight(34) + '(khong co)')
} else {
    $failCount = $failCount + 1
    $failList = $failList + $srcLabel
    Write-Host ('[LECH] ' + $srcLabel.PadRight(34) + '(co ' + $srcHits.Count + ' hardcode)')
    foreach ($h in $srcHits) {
        Write-Host ('  - ' + $h)
    }
}

if ($failCount -eq 0) {
    Write-Host ('PASS: tat ca nguon version deu = ' + $canonical)
    exit 0
}

Write-Host ('FAIL: ' + $failCount + ' nguon version bi lech (can bang ' + $canonical + ')')
foreach ($f in $failList) {
    Write-Host ('  - ' + $f)
}
exit 1
