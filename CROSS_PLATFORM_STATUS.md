# Cross-Platform Support Coming Soon!

We're currently building binaries for all platforms. This will take a few minutes.

## What's Happening

GitHub Actions is now automatically building the IC10 Language Server for:
- ✅ Windows (x64) - Available now
- 🔄 Linux (x64) - Building...
- 🔄 macOS Intel (x64) - Building...
- 🔄 macOS Apple Silicon (ARM64) - Building...

## For Linux/macOS Users (Temporary Workaround)

Until the automated builds complete, you can build the LSP locally:

### Requirements
- Rust toolchain: https://rustup.rs/

### Build Steps

```bash
# Navigate to the LSP directory
cd "Stationeers-ic10-main/FlorpyDorp IC10/ic10lsp"

# Build for your platform
cargo build --release

# Copy to extension bin directory (adjust paths for your platform)
# Linux:
cp target/release/ic10lsp "../FlorpyDorp Language Support/bin/ic10lsp-linux"

# macOS Intel:
cp target/release/ic10lsp "../FlorpyDorp Language Support/bin/ic10lsp-darwin"

# macOS Apple Silicon:
# (if on ARM Mac, same command as above but it will build native ARM64)
cp target/release/ic10lsp "../FlorpyDorp Language Support/bin/ic10lsp-darwin-arm64"
```

## Check Build Status

Monitor the GitHub Actions build at:
https://github.com/FlorpyDorpinator/IC10-Code-Extension/actions

Once complete, download the binaries from the workflow artifacts!

## Next Steps

1. Wait for GitHub Actions to complete (~10 minutes)
2. Download the artifacts from the workflow run
3. Copy the platform-specific binaries to `Stationeers-ic10-main/FlorpyDorp IC10/FlorpyDorp Language Support/bin/`
4. Package the extension with all binaries: `vsce package`
5. Publish v1.2.6 to marketplace: `vsce publish`
