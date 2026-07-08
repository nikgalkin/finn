# Install script for Finn App on Windows
$ErrorActionPreference = "Stop"

# 1. Setup paths
$BinDir = Join-Path $HOME ".finn\bin"
$BinaryPath = Join-Path $BinDir "finn.exe"

# Change this URL to your actual hosted windows binary (e.g., GitHub Releases)
$BinaryUrl = "https://github.com/nikgalkin/finn/releases/latest/download/finn-windows-amd64.exe"

Write-Host "🚀 Starting Finn installation for Windows..." -ForegroundColor Cyan
Write-Host "--------------------------------------------------"

# 2. Create directory if missing
if (-not (Test-Path $BinDir)) {
    Write-Host "📁 Creating installation directory at $BinDir..." -ForegroundColor Gray
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
}

# 3. Download the executable artifact
Write-Host "📥 Downloading latest application binary..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $BinaryUrl -OutFile $BinaryPath -UserAgent "Mozilla/5.0"
    Write-Host "✅ Binary successfully saved to $BinaryPath" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to download binary: $_" -ForegroundColor Red
    Exit 1
}

# 4. Success info
Write-Host "--------------------------------------------------"
Write-Host "🎉 Finn installation completed successfully!" -ForegroundColor Green
Write-Host "👉 To run the application, execute:" -ForegroundColor Yellow
Write-Host "   & `"$BinaryPath`"" -ForegroundColor Cyan
