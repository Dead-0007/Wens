$ErrorActionPreference = "Stop"

# 1. Resolve exact known installation directory under %LOCALAPPDATA%\وِنس
$localAppData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData)
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    throw "Could not resolve LocalApplicationData path."
}

$arabicName = (-join [char[]]@(0x0648, 0x0650, 0x0646, 0x0633)) # "وِنس"
$targetDir = Join-Path $localAppData $arabicName
$target = Join-Path $targetDir "wens-desktop.exe"

# 2. Stop running wens-desktop processes cleanly (exact name or exact target path)
Write-Host "Stopping running wens-desktop processes..."
Get-Process -Name "wens-desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$waitCount = 0
while ($waitCount -lt 25 -and (Get-Process -Name "wens-desktop" -ErrorAction SilentlyContinue)) {
    Start-Sleep -Milliseconds 200
    $waitCount++
}
Start-Sleep -Milliseconds 500

# 3. Source executable resolution (respect CARGO_TARGET_DIR first, otherwise pick newest existing release binary)
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($env:CARGO_TARGET_DIR)) {
    $sourceCandidates += (Join-Path $env:CARGO_TARGET_DIR "release\wens-desktop.exe")
}
$defaultCandidates = @(
    (Join-Path $repoRoot "target\release\wens-desktop.exe"),
    "D:\cargo-target-wens\release\wens-desktop.exe"
)
$source = $null
if ($sourceCandidates.Count -gt 0 -and (Test-Path -LiteralPath $sourceCandidates[0])) {
    $source = $sourceCandidates[0]
} else {
    $existingDefault = $defaultCandidates |
        Where-Object { Test-Path -LiteralPath $_ } |
        ForEach-Object { Get-Item -LiteralPath $_ } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($existingDefault) {
        $source = $existingDefault.FullName
    }
}
if (-not $source) {
    $allChecked = ($sourceCandidates + $defaultCandidates) | Select-Object -Unique
    throw "Release binary not found in: $($allChecked -join ', ')"
}
$sourceInfo = Get-Item -LiteralPath $source
Write-Host "Source binary: $source ($($sourceInfo.Length) bytes, LastWrite: $($sourceInfo.LastWriteTime))"

# 4. Ensure exact target directory exists (never scan or delete arbitrary folders!)
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}
Write-Host "Target resolved to: $target"

# 5. Copy binary with retry (remove old file first so NTFS EAs are not retained)
$copied = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        if (Test-Path $target) {
            Remove-Item -Path $target -Force -ErrorAction Stop
        }
        Copy-Item -Path $source -Destination $target -Force
        $copied = $true
        break
    } catch {
        Write-Warning "Target executable locked, retrying ($($i + 1)/15)..."
        Start-Sleep -Milliseconds 400
    }
}
if (-not $copied) {
    throw "Failed to copy $source to $target after 15 attempts."
}
Write-Host "Copied $source to $target successfully."
$fileInfo = Get-Item $target
Write-Host "Target file size: $($fileInfo.Length) bytes, LastWrite: $($fileInfo.LastWriteTime)"

# 6. Clear WebView2 caches strictly under com.wens.offline
$webviewDefault = Join-Path $localAppData "com.wens.offline\EBWebView\Default"
$cachePaths = @(
    (Join-Path $webviewDefault "Cache"),
    (Join-Path $webviewDefault "Code Cache"),
    (Join-Path $webviewDefault "GPUCache")
)

foreach ($cPath in $cachePaths) {
    if (Test-Path $cPath) {
        Remove-Item -Path $cPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleared cache directory: $cPath"
    }
}

# 7. Launch the application detached via WMI/CIM so it survives shell exit
$null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = "`"$target`""
    CurrentDirectory = $targetDir
}
Start-Sleep -Seconds 2

$running = Get-Process -Name "wens-desktop" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($running) {
    Write-Host "Successfully launched wens-desktop with PID: $($running.Id) ($($running.ProcessName)) from $target"
} else {
    Write-Error "Failed to launch wens-desktop."
}
