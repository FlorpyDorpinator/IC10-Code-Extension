# Build IC10 LSP for All Platforms
# Run this script after downloading artifacts from GitHub Actions

param(
    [string]$ArtifactsDir = "artifacts"
)

$BinDir = "Stationeers-ic10-main\FlorpyDorp IC10\FlorpyDorp Language Support\bin"

Write-Host "Preparing bin directory..." -ForegroundColor Cyan
if (!(Test-Path $BinDir)) {
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
}

# Clear old binaries
Write-Host "Clearing old binaries..." -ForegroundColor Yellow
Remove-Item "$BinDir\*" -Force -ErrorAction SilentlyContinue

# Copy platform-specific binaries
Write-Host "`nCopying platform binaries..." -ForegroundColor Cyan

$platforms = @(
    @{Name="windows"; Source="ic10lsp-x86_64-pc-windows-msvc\ic10lsp.exe"; Dest="ic10lsp.exe"},
    @{Name="linux"; Source="ic10lsp-x86_64-unknown-linux-gnu\ic10lsp"; Dest="ic10lsp-linux"},
    @{Name="macos-intel"; Source="ic10lsp-x86_64-apple-darwin\ic10lsp"; Dest="ic10lsp-darwin"},
    @{Name="macos-arm"; Source="ic10lsp-aarch64-apple-darwin\ic10lsp"; Dest="ic10lsp-darwin-arm64"}
)

foreach ($platform in $platforms) {
    $sourcePath = Join-Path $ArtifactsDir $platform.Source
    $destPath = Join-Path $BinDir $platform.Dest
    
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath $destPath -Force
        Write-Host "  ✓ $($platform.Name): $($platform.Dest)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($platform.Name): NOT FOUND at $sourcePath" -ForegroundColor Red
    }
}

Write-Host "`nBinaries ready in: $BinDir" -ForegroundColor Cyan
Write-Host "Now run: vsce package" -ForegroundColor Yellow
