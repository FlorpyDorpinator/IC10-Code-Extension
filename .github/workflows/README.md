# GitHub Actions Workflows

This directory contains automated workflows for the IC10 Extension.

## Workflows

### 1. `build-lsp.yml` - Build LSP Binaries
**Triggers:** 
- Push to `ic10lsp/**` or `tree-sitter-ic10/**` directories
- Manual trigger

**Purpose:** Builds the IC10 Language Server for all platforms (Windows, Linux, macOS Intel/ARM).

**Artifacts:** Individual LSP binaries for each platform.

---

### 2. `release.yml` - Build and Release Extension
**Triggers:**
- Push of a version tag (e.g., `v1.2.10`)
- Manual trigger with version input

**Purpose:** Complete release pipeline that:
1. Builds LSP binaries for all platforms
2. Packages the VS Code extension with all binaries
3. Creates a GitHub Release with the `.vsix` file
4. Publishes to VS Code Marketplace (if token is configured)

**Artifacts:** Packaged `.vsix` extension file ready for distribution.

---

## How to Use

### Automatic Release (Recommended)

1. **Update version in `package.json`:**
   ```json
   "version": "1.2.11"
   ```

2. **Update CHANGELOG.md** with release notes

3. **Commit changes:**
   ```bash
   git add .
   git commit -m "chore: bump version to 1.2.11"
   git push
   ```

4. **Create and push a version tag:**
   ```bash
   git tag v1.2.11
   git push origin v1.2.11
   ```

5. **Wait for the workflow to complete** (~10-15 minutes)

6. **Check results:**
   - GitHub Release: https://github.com/FlorpyDorpinator/IC10-Code-Extension/releases
   - VS Code Marketplace: https://marketplace.visualstudio.com/manage (if published)

---

### Manual Release

1. Go to **Actions** → **Build and Release Extension**
2. Click **Run workflow**
3. Enter the version (e.g., `1.2.11`)
4. Click **Run workflow**

---

## Setup Requirements

### For GitHub Releases (Already Working ✅)
No additional setup needed! GitHub automatically provides the `GITHUB_TOKEN`.

### For VS Code Marketplace Publishing (Optional)

To enable automatic publishing to the VS Code Marketplace:

1. **Create a Personal Access Token (PAT):**
   - Go to https://dev.azure.com/
   - Click on your profile → **Security** → **Personal Access Tokens**
   - Click **+ New Token**
   - Name: `VS Code Marketplace`
   - Organization: **All accessible organizations**
   - Expiration: Your choice (recommend 90+ days)
   - Scopes: **Marketplace** → **Manage** (check the box)
   - Click **Create**
   - **Copy the token immediately** (you won't see it again!)

2. **Add the token to GitHub Secrets:**
   - Go to https://github.com/FlorpyDorpinator/IC10-Code-Extension/settings/secrets/actions
   - Click **New repository secret**
   - Name: `VSCE_PAT`
   - Value: Paste your PAT
   - Click **Add secret**

3. **Done!** The next tag push will automatically publish to the marketplace.

---

## Workflow Status

Check workflow runs at:
https://github.com/FlorpyDorpinator/IC10-Code-Extension/actions

Green checkmark ✅ = Success
Red X ❌ = Failed (click for details)

---

## Troubleshooting

### "VSCE_PAT not found" warning
This is normal if you haven't set up marketplace publishing. The extension will still be packaged and released on GitHub.

### Build fails on a specific platform
Check the logs for that platform. Usually caused by:
- Rust compilation errors
- Missing dependencies
- Cache corruption (re-run the workflow)

### Package step fails
Usually caused by:
- Missing binaries (check if LSP build succeeded)
- npm install issues (check `package.json`)
- Version mismatch in `package.json`

---

## Quick Reference Commands

```bash
# Bump version and release
git add .
git commit -m "feat: add new feature"
git tag v1.2.11
git push && git push --tags

# Check workflow status
gh run list --workflow=release.yml

# Download latest release artifact
gh release download --pattern '*.vsix'
```
