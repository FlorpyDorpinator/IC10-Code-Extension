# Cross-platform IC10 LSP Build Script
# This script helps build the ic10lsp binary for multiple platforms

param(
    [switch]$Windows,
    [switch]$Linux,
    [switch]$MacOS,
    [switch]$All,
    [switch]$Help
)

$ExtensionRoot = Split-Path $PSScriptRoot -Parent
$LSPDir = Join-Path $ExtensionRoot "Stationeers-ic10-main\FlorpyDorp IC10\ic10lsp"
$BinDir = Join-Path $ExtensionRoot "Stationeers-ic10-main\FlorpyDorp IC10\FlorpyDorp Language Support\bin"

function Show-Help {
    Write-Host "IC10 LSP Cross-Platform Build Script"
    Write-Host "======================================"
    Write-Host ""
    Write-Host "Usage: .\build-cross-platform.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Windows    Build for Windows (x64)"
    Write-Host "  -Linux      Build for Linux (x64) - requires cross-compilation setup"
    Write-Host "  -MacOS      Build for macOS (x64 + ARM64) - requires macOS or cross-compilation"
    Write-Host "  -All        Build for all platforms"
    Write-Host "  -Help       Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\build-cross-platform.ps1 -Windows"
    Write-Host "  .\build-cross-platform.ps1 -All"
    Write-Host ""
    Write-Host "Note: Cross-compilation requires additional Rust targets installed:"
    Write-Host "  rustup target add x86_64-unknown-linux-gnu"
    Write-Host "  rustup target add x86_64-apple-darwin"
    Write-Host "  rustup target add aarch64-apple-darwin"
    Write-Host ""
    Write-Host "For easiest cross-platform builds, use GitHub Actions (see .github/workflows/build-lsp.yml)"
}

function Build-Platform {
    param(
        [string]$Target,
        [string]$OutputName
    )
    
    Write-Host "Building for $Target..." -ForegroundColor Cyan
    
    Push-Location $LSPDir
    
    try {
        # Add target if not already installed
        Write-Host "  Ensuring target $Target is installed..."
        rustup target add $Target 2>&1 | Out-Null
        
        # Build
        Write-Host "  Compiling..."
        cargo build --release --target $Target
        
        if ($LASTEXITCODE -eq 0) {
            # Copy to bin directory
            $SourcePath = Join-Path $LSPDir "target\$Target\release\$OutputName"
            $DestPath = Join-Path $BinDir $OutputName
            
            if (!(Test-Path $BinDir)) {
                New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
            }
            
            Write-Host "  Copying to $DestPath..." -ForegroundColor Green
            Copy-Item -Force $SourcePath -Destination $DestPath
            
            Write-Host "  ✓ Build successful for $Target" -ForegroundColor Green
            return $true
        } else {
            Write-Host "  ✗ Build failed for $Target" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "  ✗ Error building for $Target`: $_" -ForegroundColor Red
        return $false
    } finally {
        Pop-Location
    }
}

# Show help if requested or no parameters
if ($Help -or (-not ($Windows -or $Linux -or $MacOS -or $All))) {
    Show-Help
    exit 0
}

Write-Host "IC10 LSP Cross-Platform Build" -ForegroundColor Yellow
Write-Host "==============================" -ForegroundColor Yellow
Write-Host ""

$BuildResults = @{}

# Build Windows
if ($Windows -or $All) {
    $BuildResults["Windows x64"] = Build-Platform "x86_64-pc-windows-msvc" "ic10lsp-win32.exe"
}

# Build Linux
if ($Linux -or $All) {
    Write-Host ""
    Write-Host "Note: Linux cross-compilation on Windows may require additional setup." -ForegroundColor Yellow
    Write-Host "Consider using WSL or GitHub Actions for Linux builds." -ForegroundColor Yellow
    Write-Host ""
    $BuildResults["Linux x64"] = Build-Platform "x86_64-unknown-linux-gnu" "ic10lsp-linux"
}

# Build macOS
if ($MacOS -or $All) {
    Write-Host ""
    Write-Host "Note: macOS cross-compilation requires macOS SDK and additional setup." -ForegroundColor Yellow
    Write-Host "Consider using GitHub Actions for macOS builds." -ForegroundColor Yellow
    Write-Host ""
    $BuildResults["macOS Intel"] = Build-Platform "x86_64-apple-darwin" "ic10lsp-darwin"
    $BuildResults["macOS ARM64"] = Build-Platform "aarch64-apple-darwin" "ic10lsp-darwin-arm64"
}

# Summary
Write-Host ""
Write-Host "Build Summary" -ForegroundColor Yellow
Write-Host "=============" -ForegroundColor Yellow
foreach ($platform in $BuildResults.Keys) {
    $status = if ($BuildResults[$platform]) { "✓ SUCCESS" } else { "✗ FAILED" }
    $color = if ($BuildResults[$platform]) { "Green" } else { "Red" }
    Write-Host "  $platform`: $status" -ForegroundColor $color
}

Write-Host ""
Write-Host "Binaries are located in: $BinDir" -ForegroundColor Cyan
