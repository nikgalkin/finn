# Install script for Finn App on Windows
param(
    [string]$Version = $env:FINN_VERSION
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Version)) {
    $ReleasePath = "latest/download"
    $VersionLabel = "latest"
} else {
    $Version = $Version.Trim()
    if (-not $Version.StartsWith("v")) {
        $Version = "v$Version"
    }

    if ($Version -notmatch '^v[0-9][A-Za-z0-9._-]*$') {
        throw "Invalid version: $Version"
    }

    $ReleasePath = "download/$Version"
    $VersionLabel = $Version
}

# 1. Setup paths
$BinDir = Join-Path $HOME ".finn\bin"
$BinaryPath = Join-Path $BinDir "finn.exe"
$TempName = ".finn.$([guid]::NewGuid().ToString('N')).tmp.exe"
$TempPath = Join-Path $BinDir $TempName

$BinaryUrl = "https://github.com/nikgalkin/finn/releases/$ReleasePath/finn-windows-amd64.exe"

function Get-RunningInstalledFinn {
    if (-not (Test-Path $BinaryPath)) {
        return @()
    }

    $ExpectedPath = [System.IO.Path]::GetFullPath($BinaryPath)
    return @(
        Get-Process -Name "finn" -ErrorAction SilentlyContinue | Where-Object {
            try {
                $ProcessPath = [System.IO.Path]::GetFullPath($_.Path)
                [string]::Equals($ProcessPath, $ExpectedPath, [System.StringComparison]::OrdinalIgnoreCase)
            } catch {
                $false
            }
        }
    )
}

Write-Host "🚀 Starting Finn installation for Windows..." -ForegroundColor Cyan
Write-Host "--------------------------------------------------"

# 2. Create directory if missing
if (-not (Test-Path $BinDir)) {
    Write-Host "📁 Creating installation directory at $BinDir..." -ForegroundColor Gray
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
}

# 3. Download, validate, and atomically replace the executable artifact
Write-Host "ℹ️ Version: $VersionLabel" -ForegroundColor Gray
Write-Host "📥 Downloading application binary..." -ForegroundColor Yellow
$InstallError = $null
try {
    if (@(Get-RunningInstalledFinn).Count -gt 0) {
        throw "Finn is currently running from $BinaryPath. Close Finn and run the installer again."
    }

    Invoke-WebRequest -Uri $BinaryUrl -OutFile $TempPath -UserAgent "Mozilla/5.0"
    Unblock-File -Path $TempPath -ErrorAction SilentlyContinue

    Write-Host "🔎 Validating downloaded binary..." -ForegroundColor Gray
    $InstalledVersion = (& $TempPath -v | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Downloaded binary failed validation with exit code $LASTEXITCODE"
    }
    if (-not $InstalledVersion.StartsWith("finn version ")) {
        throw "Downloaded file returned an unexpected version: $InstalledVersion"
    }

    if (Test-Path $BinaryPath) {
        if (@(Get-RunningInstalledFinn).Count -gt 0) {
            throw "Finn is currently running from $BinaryPath. Close Finn and run the installer again."
        }

        $MaxReplaceAttempts = 10
        for ($Attempt = 1; $Attempt -le $MaxReplaceAttempts; $Attempt++) {
            try {
                [System.IO.File]::Replace($TempPath, $BinaryPath, $null)
                break
            } catch [System.IO.IOException], [System.UnauthorizedAccessException] {
                if ($Attempt -eq $MaxReplaceAttempts) {
                    if (@(Get-RunningInstalledFinn).Count -gt 0) {
                        throw "Finn started while the installer was running. Close Finn and run the installer again."
                    }

                    throw "Could not replace $BinaryPath after $MaxReplaceAttempts attempts. Another process may be locking the file. Close Finn and try again. Original error: $($_.Exception.Message)"
                }

                Start-Sleep -Milliseconds 500
            }
        }
    } else {
        [System.IO.File]::Move($TempPath, $BinaryPath)
    }

    $TempPath = $null
    Write-Host "✅ Binary successfully saved to $BinaryPath" -ForegroundColor Green
} catch {
    $InstallError = $_
} finally {
    if ($TempPath -and (Test-Path $TempPath)) {
        Remove-Item -Force $TempPath -ErrorAction SilentlyContinue
    }
}

if ($InstallError) {
    Write-Host "❌ Installation failed; existing binary was not changed: $InstallError" -ForegroundColor Red
    Exit 1
}

# 3.5. Add to PATH if not already there
Write-Host "⚙️ Adding $BinDir to User PATH..." -ForegroundColor Gray
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($UserPath -split ';' -notcontains $BinDir) {
    [Environment]::SetEnvironmentVariable("Path", $UserPath + ";" + $BinDir, "User")
    Write-Host "✅ Path successfully updated in Windows Registry!" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Path is already in environment variables." -ForegroundColor Gray
}

# 4. Success info
Write-Host "--------------------------------------------------"
Write-Host "🎉 Finn installation completed successfully!" -ForegroundColor Green
Write-Host "   $InstalledVersion" -ForegroundColor Gray
Write-Host ""
Write-Host "📢 IMPORTANT: Please open a NEW terminal window to apply changes." -ForegroundColor Yellow
Write-Host ""
Write-Host "👉 To run the application, just type:" -ForegroundColor Yellow
Write-Host "   finn" -ForegroundColor Cyan
Write-Host ""
Write-Host "✨ Quick Start:" -ForegroundColor Yellow
Write-Host "   Want to test it out right away? Run with the demo flag:" -ForegroundColor Gray
Write-Host "   finn --demo" -ForegroundColor Cyan
Write-Host "--------------------------------------------------"
