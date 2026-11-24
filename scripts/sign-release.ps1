<#
.SYNOPSIS
    Authenticode code-signing and signature verification script for Wens PC releases.

.DESCRIPTION
    Signs and verifies both the main Windows executable (`wens-desktop.exe`) and the
    NSIS installer (`release\وِنس_<version>_x64-setup.exe`) using Windows SDK
    `signtool.exe` with SHA-256 file digests and RFC 3161 SHA-256 timestamping.

    Supports three signing backends:
      1. Local `.pfx` / `.p12` certificate file (`-Mode Pfx`)
      2. Windows Certificate Store thumbprint or subject (`-Mode CertStore`)
      3. Microsoft Azure Trusted Signing (`-Mode AzureTrustedSigning`)

    Use `-VerifyOnly` to verify signatures and print SHA-256 checksums without
    modifying any files.

.EXAMPLE
    # Sign with a local PFX certificate (password from environment variable)
    $env:WENS_SIGN_PFX_PASSWORD = "<secret>"
    .\scripts\sign-release.ps1 -Mode Pfx -PfxPath "C:\certs\wens-release.pfx" -WriteChecksums

.EXAMPLE
    # Sign with Microsoft Azure Trusted Signing
    .\scripts\sign-release.ps1 -Mode AzureTrustedSigning `
        -AzureMetadataPath "C:\signing\metadata.json" `
        -AzureDlibPath "C:\signing\Azure.CodeSigning.Dlib.dll" `
        -WriteChecksums

.EXAMPLE
    # Verify existing Authenticode signatures and hashes without modifying binaries
    .\scripts\sign-release.ps1 -VerifyOnly
#>
[CmdletBinding()]
param(
    [ValidateSet('Auto', 'Pfx', 'CertStore', 'AzureTrustedSigning')]
    [string]$Mode = 'Auto',

    [string]$Version,

    [string]$AppExePath,

    [string]$InstallerPath,

    [string]$PfxPath = $env:WENS_SIGN_PFX_PATH,

    [string]$PfxPassword = $env:WENS_SIGN_PFX_PASSWORD,

    [string]$CertThumbprint = $env:WENS_SIGN_CERT_THUMBPRINT,

    [string]$CertSubjectName = $env:WENS_SIGN_CERT_SUBJECT,

    [string]$AzureMetadataPath = $env:WENS_TRUSTED_SIGNING_METADATA,

    [string]$AzureDlibPath = $env:WENS_TRUSTED_SIGNING_DLIB,

    [string]$TimestampUrl = $env:WENS_SIGN_TIMESTAMP_URL,

    [string]$Description = 'Wens Desktop',

    [string]$DescriptionUrl = 'https://github.com/wens-offline',

    [string]$SignToolPath = $env:SIGNTOOL_PATH,

    [switch]$SkipAppExe,

    [switch]$SkipInstaller,

    [switch]$VerifyOnly,

    [switch]$WriteChecksums
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ArabicProductName = (-join [char[]]@(0x0648, 0x0650, 0x0646, 0x0633)) # "وِنس"

function Resolve-ReleaseVersion {
    param([string]$ExplicitVersion)
    if (-not [string]::IsNullOrWhiteSpace($ExplicitVersion)) {
        return $ExplicitVersion.Trim()
    }
    $tauriConfPath = Join-Path $RepoRoot 'src-tauri\tauri.conf.json'
    if (Test-Path -LiteralPath $tauriConfPath) {
        $tauriConf = Get-Content -LiteralPath $tauriConfPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not [string]::IsNullOrWhiteSpace($tauriConf.version)) {
            return $tauriConf.version.Trim()
        }
    }
    return '1.0.0'
}

function Resolve-AppExe {
    param([string]$ExplicitPath)
    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        return $ExplicitPath
    }
    if (-not [string]::IsNullOrWhiteSpace($env:CARGO_TARGET_DIR)) {
        $envCandidate = Join-Path $env:CARGO_TARGET_DIR 'release\wens-desktop.exe'
        if (Test-Path -LiteralPath $envCandidate) {
            return $envCandidate
        }
    }
    $defaultCandidates = @(
        (Join-Path $RepoRoot 'target\release\wens-desktop.exe'),
        'D:\cargo-target-wens\release\wens-desktop.exe'
    )
    $newest = $defaultCandidates |
        Where-Object { Test-Path -LiteralPath $_ } |
        ForEach-Object { Get-Item -LiteralPath $_ } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($newest) {
        return $newest.FullName
    }
    return $defaultCandidates[0]
}

function Resolve-SignTool {
    param([string]$ExplicitPath)
    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        if (-not (Test-Path -LiteralPath $ExplicitPath)) {
            throw "Specified signtool.exe does not exist: $ExplicitPath"
        }
        return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }

    $inPath = Get-Command 'signtool.exe' -ErrorAction SilentlyContinue
    if ($inPath) {
        return $inPath.Source
    }

    $kitsRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    if (Test-Path -LiteralPath $kitsRoot) {
        foreach ($arch in @('x64', 'arm64', 'x86')) {
            $found = Get-ChildItem -Path $kitsRoot -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { Join-Path $_.FullName "$arch\signtool.exe" } |
                Where-Object { Test-Path -LiteralPath $_ } |
                Select-Object -First 1
            if ($found) {
                return $found
            }
        }
    }

    throw "signtool.exe not found. Install Windows 10/11 SDK (Signing Tools for Desktop Apps) or pass -SignToolPath / `$env:SIGNTOOL_PATH."
}

function Resolve-SigningMode {
    param([string]$RequestedMode)
    if ($RequestedMode -ne 'Auto') {
        return $RequestedMode
    }
    if (-not [string]::IsNullOrWhiteSpace($AzureMetadataPath)) {
        return 'AzureTrustedSigning'
    }
    if (-not [string]::IsNullOrWhiteSpace($PfxPath)) {
        return 'Pfx'
    }
    if (-not [string]::IsNullOrWhiteSpace($CertThumbprint) -or -not [string]::IsNullOrWhiteSpace($CertSubjectName)) {
        return 'CertStore'
    }
    throw @"
No signing credentials configured. Provide one of:
  1) Local PFX:             -Mode Pfx -PfxPath <path.pfx> [-PfxPassword <pw> | `$env:WENS_SIGN_PFX_PASSWORD]
  2) Windows Cert Store:    -Mode CertStore -CertThumbprint <sha1> (or -CertSubjectName <CN>)
  3) Azure Trusted Signing: -Mode AzureTrustedSigning -AzureMetadataPath <metadata.json> -AzureDlibPath <Azure.CodeSigning.Dlib.dll>
  4) Inspection only:       -VerifyOnly
"@
}

function Invoke-SignTarget {
    param(
        [string]$ToolPath,
        [string]$TargetPath,
        [string]$ResolvedMode,
        [string]$ResolvedTimestampUrl
    )

    $signArgs = @(
        'sign',
        '/v',
        '/fd', 'SHA256',
        '/tr', $ResolvedTimestampUrl,
        '/td', 'SHA256',
        '/d', $Description,
        '/du', $DescriptionUrl
    )

    switch ($ResolvedMode) {
        'Pfx' {
            if ([string]::IsNullOrWhiteSpace($PfxPath) -or -not (Test-Path -LiteralPath $PfxPath)) {
                throw "PFX certificate file not found: $PfxPath"
            }
            $signArgs += @('/f', (Resolve-Path -LiteralPath $PfxPath).Path)
            if (-not [string]::IsNullOrWhiteSpace($PfxPassword)) {
                $signArgs += @('/p', $PfxPassword)
            }
        }
        'CertStore' {
            if (-not [string]::IsNullOrWhiteSpace($CertThumbprint)) {
                $cleanThumb = ($CertThumbprint -replace '\s+', '')
                $signArgs += @('/sha1', $cleanThumb)
            } elseif (-not [string]::IsNullOrWhiteSpace($CertSubjectName)) {
                $signArgs += @('/n', $CertSubjectName)
            } else {
                $signArgs += '/a'
            }
        }
        'AzureTrustedSigning' {
            if ([string]::IsNullOrWhiteSpace($AzureMetadataPath) -or -not (Test-Path -LiteralPath $AzureMetadataPath)) {
                throw "Azure Trusted Signing metadata JSON not found: $AzureMetadataPath"
            }
            if ([string]::IsNullOrWhiteSpace($AzureDlibPath) -or -not (Test-Path -LiteralPath $AzureDlibPath)) {
                throw "Azure.CodeSigning.Dlib.dll not found: $AzureDlibPath (install Microsoft.Trusted.Signing.Client NuGet package)"
            }
            $signArgs += @(
                '/dlib', (Resolve-Path -LiteralPath $AzureDlibPath).Path,
                '/dmdf', (Resolve-Path -LiteralPath $AzureMetadataPath).Path
            )
        }
    }

    $signArgs += $TargetPath

    Write-Host "Signing ($ResolvedMode): $TargetPath" -ForegroundColor Cyan
    & $ToolPath @signArgs
    if ($LASTEXITCODE -ne 0) {
        throw "signtool.exe failed for '$TargetPath' with exit code $LASTEXITCODE"
    }
}

function Test-TargetSignature {
    param([string]$TargetPath)

    $sig = Get-AuthenticodeSignature -LiteralPath $TargetPath
    $hash = (Get-FileHash -LiteralPath $TargetPath -Algorithm SHA256).Hash
    $size = (Get-Item -LiteralPath $TargetPath).Length

    $signerSubject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '(none)' }
    $signerThumb   = if ($sig.SignerCertificate) { $sig.SignerCertificate.Thumbprint } else { '(none)' }
    $tsSubject     = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { '(none)' }

    Write-Host ""
    Write-Host "Target:     $TargetPath"
    Write-Host "Size:       $size bytes"
    Write-Host "SHA-256:    $hash"
    Write-Host "Status:     $($sig.Status) ($($sig.StatusMessage))"
    Write-Host "Signer:     $signerSubject"
    Write-Host "Thumbprint: $signerThumb"
    Write-Host "Timestamp:  $tsSubject"

    return [pscustomobject]@{
        Path      = $TargetPath
        FileName  = (Split-Path -Leaf $TargetPath)
        SizeBytes = $size
        Sha256    = $hash
        Status    = [string]$sig.Status
        Valid     = ($sig.Status -eq 'Valid' -and $null -ne $sig.TimeStamperCertificate)
    }
}

$resolvedVersion = Resolve-ReleaseVersion -ExplicitVersion $Version
$resolvedAppExe = Resolve-AppExe -ExplicitPath $AppExePath
$resolvedInstaller = if (-not [string]::IsNullOrWhiteSpace($InstallerPath)) {
    $InstallerPath
} else {
    Join-Path $RepoRoot ("release\{0}_{1}_x64-setup.exe" -f $ArabicProductName, $resolvedVersion)
}

$targets = @()
if (-not $SkipAppExe) {
    $targets += $resolvedAppExe
}
if (-not $SkipInstaller) {
    $targets += $resolvedInstaller
}

if ($targets.Count -eq 0) {
    throw "No signing targets selected (both -SkipAppExe and -SkipInstaller were specified)."
}

foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target)) {
        throw "Target binary not found: $target"
    }
}

if (-not $VerifyOnly) {
    $resolvedMode = Resolve-SigningMode -RequestedMode $Mode
    $resolvedTool = Resolve-SignTool -ExplicitPath $SignToolPath
    $resolvedTimestamp = if (-not [string]::IsNullOrWhiteSpace($TimestampUrl)) {
        $TimestampUrl
    } elseif ($resolvedMode -eq 'AzureTrustedSigning') {
        'http://timestamp.acs.microsoft.com'
    } else {
        'http://timestamp.digicert.com'
    }

    Write-Host "Using signtool: $resolvedTool"
    Write-Host "Timestamp server (RFC3161 SHA-256): $resolvedTimestamp"
    Write-Host "Note: For production NSIS installers, sign wens-desktop.exe BEFORE packaging NSIS (or via Tauri bundle.windows.signCommand), then sign the final NSIS setup .exe." -ForegroundColor Yellow

    foreach ($target in $targets) {
        Invoke-SignTarget -ToolPath $resolvedTool -TargetPath $target -ResolvedMode $resolvedMode -ResolvedTimestampUrl $resolvedTimestamp
    }
}

Write-Host "`n=== Authenticode Signature Verification ===" -ForegroundColor Cyan
$results = @()
$allValid = $true
foreach ($target in $targets) {
    $res = Test-TargetSignature -TargetPath $target
    $results += $res
    if (-not $res.Valid) {
        $allValid = $false
    }
}

if (-not $allValid) {
    Write-Error 'One or more release binaries lack a valid Authenticode signature or timestamp.'
    exit 1
}

if ($WriteChecksums) {
    $checksumPath = Join-Path $RepoRoot 'release\SHA256SUMS.txt'
    $checksumLines = $results | ForEach-Object { "{0}  {1}" -f $_.Sha256, $_.FileName }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($checksumPath, $checksumLines, $utf8NoBom)
    Write-Host "`nWrote SHA-256 checksums to: $checksumPath" -ForegroundColor Green
}

Write-Host "`nAll $($results.Count) target(s) verified with valid, timestamped Authenticode signatures." -ForegroundColor Green
exit 0
