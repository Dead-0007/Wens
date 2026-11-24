# Wens PC Release Checklist (`RELEASE_CHECKLIST.md`)

Operational step-by-step runbook for building, verifying, signing, and publishing **Wens Desktop (`وِنس`)** releases for Windows x64.

---

## 1. Pre-Release Version & Hygiene Verification

Confirm the target semantic version (e.g. `1.0.0`) matches across every manifest and release document:

- [ ] `package.json` (`version`)
- [ ] `package-lock.json` (`version`, `packages[""].version`, `packages["apps/app-ui"].version`)
- [ ] `apps/app-ui/package.json` (`version`)
- [ ] `Cargo.toml` (`[workspace.package].version`)
- [ ] `src-tauri/Cargo.toml` (`[package].version`)
- [ ] `src-tauri/tauri.conf.json` (`version`)
- [ ] `scripts/generate-audio.mjs` (`User-Agent` version string)
- [ ] `PRIVACY.md`, `THIRD_PARTY_NOTICES.md`, `README.md`, `IMPLEMENTATION_STATUS.md`, and `CHANGELOG.md`
- [ ] Verify `.cargo/config.toml` has **no** machine-specific hardcoded `target-dir` (portable `target/` default; optional `CARGO_TARGET_DIR` override only).
- [ ] Confirm the bundled `AmiriQuran.ttf` and `OFL.txt` match the unmodified upstream release in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- [ ] Confirm `git status` shows zero stray logs, screenshots, `WebView2Loader.dll`, or temporary scratch files tracked in Git.

---

## 2. Clean Portable Build

On a clean Windows PC or CI runner (no `D:\` drive required):

```powershell
# 1. Install JS dependencies cleanly from lockfile
npm ci

# 2. Build React/TS frontend and sync desktop/companion/overlay/audio/font assets
npm run desktop:sync

# 3. Build stripped release binary + NSIS x64 installer
# (Optional: set $env:CARGO_TARGET_DIR to use a custom build cache drive)
npm run desktop:build
```

Copy the resulting NSIS installer to `release\`:

```powershell
$targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path (Get-Location) 'target' }
$arabic = (-join [char[]]@(0x0648, 0x0650, 0x0646, 0x0633)) # "وِنس"
$version = (Get-Content -Raw src-tauri\tauri.conf.json | ConvertFrom-Json).version
New-Item -ItemType Directory -Force release | Out-Null
Copy-Item -LiteralPath (Join-Path $targetDir "release\bundle\nsis\${arabic}_${version}_x64-setup.exe") -Destination "release\${arabic}_${version}_x64-setup.exe" -Force
```

Verify release build sanity:

- [ ] Confirm offline installation on a machine without WebView2. The bundle includes the runtime installer. The build runner needs network access for its initial download.
- [ ] Confirm the installer includes `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `fonts/OFL.txt` in the installed application directory.
- [ ] `0` Rust compiler warnings and `0` `.rsrc` duplicate-manifest warnings.
- [ ] `wens-desktop.exe` embeds the `Microsoft.Windows.Common-Controls` v6 manifest and is stripped (`~13 MB`).
- [ ] `release\وِنس_<version>_x64-setup.exe` SHA-256 matches the `bundle\nsis\` build output byte-for-byte.

---

## 3. Mandatory Automated Test Gates

Run the full test suite and require **100% pass** before tagging or publishing:

```powershell
# Full gate: smoke-test.mjs + prayer-regression-test.mjs + cargo test --workspace + npm run test:vnext
npm test

# TypeScript strict check
npm --workspace @wens/app-ui exec -- tsc --noEmit

# Companion behavior, reminder presentation, and context-menu checks (Microsoft Edge)
npm run test:companion
```

Checklist:
- [ ] `node smoke-test.mjs` — PASS
- [ ] `node prayer-regression-test.mjs` — PASS (Cairo authority table exact match + full-year ordering)
- [ ] `cargo test --workspace` — PASS (`wens-core`, `wens-module-runtime`, `wens-desktop` unit & chaos tests)
- [ ] `npm run test:vnext` — PASS (`tsc -b`, `vite build`, all Vitest suites)
- [ ] `npm run test:companion` — PASS

---

## 4. Code Signing (Authenticode) & Checksums

Use [`scripts/sign-release.ps1`](scripts/sign-release.ps1) with SHA-256 digest and RFC 3161 SHA-256 timestamping.

> [!IMPORTANT]
> For a **fully signed production installer**, sign `wens-desktop.exe` **before** NSIS bundles it. Configure `bundle.windows.signCommand` or `bundle.windows.certificateThumbprint` in `src-tauri/tauri.conf.json` during the release build, then sign the resulting NSIS setup `.exe`. Verify the installer and the executable it actually installs with `signtool verify /pa /tw`. SmartScreen can still warn on a new download while reputation builds. [Microsoft SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

### Option A — Local `.pfx` Certificate (OV / EV)
```powershell
$env:WENS_SIGN_PFX_PASSWORD = "<certificate-password>"
.\scripts\sign-release.ps1 -Mode Pfx -PfxPath "C:\certs\wens-release.pfx" -WriteChecksums
```

### Option B — Microsoft Azure Artifact Signing (Requires an Eligible Account)
```powershell
.\scripts\sign-release.ps1 -Mode AzureTrustedSigning `
    -AzureMetadataPath "C:\signing\metadata.json" `
    -AzureDlibPath "C:\signing\Azure.CodeSigning.Dlib.dll" `
    -WriteChecksums
```

### Option C — Windows Certificate Store
```powershell
.\scripts\sign-release.ps1 -Mode CertStore -CertThumbprint "<SHA1-THUMBPRINT>" -WriteChecksums
```

### Option D — SignPath Foundation (Free for Accepted Open-Source Projects)

The [Windows build workflow](.github/workflows/windows-build.yml) can produce an unsigned NSIS build artifact from a manually selected Git revision. It creates no GitHub Release and uses no signing credentials.

After approval to publish, create a public source repository and a release in the same installer format intended for signing. Keep the source-to-NSIS build verifiable. Confirm eligibility with SignPath for the maintainer and the installer that bundles Microsoft's standalone WebView2 runtime. If accepted, configure GitHub build provenance, maintainer roles, MFA, and the public code signing policy before requesting signatures. The publisher certificate belongs to SignPath Foundation. [Eligibility and signing policy](https://signpath.org/terms) · [Application](https://signpath.org/apply.html)

### Verify Signatures & Generate Checksums
```powershell
# Verify signatures and timestamps before writing the checksum manifest
.\scripts\sign-release.ps1 -VerifyOnly -WriteChecksums
```

For unsigned community/beta builds, still record SHA-256 checksums:
```powershell
Get-FileHash release\*.exe -Algorithm SHA256 | Format-Table -AutoSize
```

---

## 5. Live Windows Clean-Install & Upgrade Gate

Before public publishing, test the actual installer on Windows 10/11 x64:

- [ ] **Safety Backup:** Back up any existing `%APPDATA%\com.wens.offline\wens.sqlite3` before upgrade testing.
- [ ] **Installer Execution:** Run `release\وِنس_<version>_x64-setup.exe` (both interactive UI and silent `/S`), verify exit code `0`, Start Menu shortcut, and Windows Uninstall entry.
- [ ] **Upgrade Integrity:** Confirm `%APPDATA%\com.wens.offline\wens.sqlite3` passes `PRAGMA integrity_check`, schema version is `3`, and zero user records are lost.
- [ ] **Live Runtime Telemetry:** Leave running for 30s+ (normal and tray-idle); confirm low idle CPU, stable thread/handle counts (no leak), and zero panics/errors in `%APPDATA%\com.wens.offline\logs\wens.log`.
- [ ] **Win32 Surface Verification:** Confirm Main Window, Dynamic Island (`Ctrl+Alt+I`), Native Win32 Taskbar Strip + left-click Flyout, and Companion Pet render inside valid monitor bounds.
- [ ] **Single-Instance Check:** Launching a second `wens-desktop.exe` focuses the existing instance and exits immediately.
- [ ] **Uninstall Cleanliness:** Verify Uninstaller removes `%LOCALAPPDATA%\وِنس` cleanly while preserving user data unless manually deleted.

---

## 6. Publishing to GitHub Releases

1. Commit release changes and create an annotated tag:
   ```powershell
   git tag -a v1.0.0 -m "Wens PC v1.0.0"
   git push origin main --tags
   ```
2. Draft a GitHub Release for tag `v1.0.0`:
   - Copy the `v1.0.0` section from [`CHANGELOG.md`](CHANGELOG.md).
   - Attach `release\وِنس_1.0.0_x64-setup.exe` and `release\SHA256SUMS.txt`.
   - Include the SmartScreen disclosure below if the release is **unsigned**.
3. After publishing, download the uploaded installer from GitHub and verify its SHA-256 matches `SHA256SUMS.txt`.

---

## 7. SmartScreen Disclosure (Unsigned Beta / Community Builds)

If the installer is distributed **unsigned**, include the following notice in the GitHub Release notes:

> **Windows SmartScreen Notice (Unsigned Release):**
> This community build of **Wens Desktop (`وِنس`)** is not yet signed with a paid Windows Authenticode code-signing certificate. Windows Defender SmartScreen may display *"Windows protected your PC"* when running the installer for the first time.
>
> Before proceeding:
> 1. Download exclusively from the official GitHub Releases page.
> 2. Verify the installer's SHA-256 hash matches `SHA256SUMS.txt` (`Get-FileHash .\وِنس_1.0.0_x64-setup.exe -Algorithm SHA256`).
> 3. Click **More info → Run anyway** only after verifying the checksum.
>
> All core features work 100% offline with zero telemetry; see [`PRIVACY.md`](PRIVACY.md).

---

## 8. Future Auto-Updater Wiring (`tauri-plugin-updater`)

Auto-updates are intentionally deferred past `v1.0.0` to guarantee strict offline predictability and wait for stable release signing. When enabling `tauri-plugin-updater` in a future `v1.x` release:

1. **Generate an Ed25519 Signing Keypair (offline, never commit private key):**
   ```powershell
   cargo tauri signer generate -w "$env:USERPROFILE\.tauri\wens-updater.key"
   ```
   - Store the private key content in GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` (and password in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
2. **Add Dependencies:**
   - Rust (`src-tauri/Cargo.toml`): `tauri-plugin-updater = "2"` (under desktop-only `cfg` target).
   - Frontend (`apps/app-ui/package.json`): `@tauri-apps/plugin-updater`.
   - Capability (`src-tauri/capabilities/default.json`): grant `updater:default` strictly to the `main` window.
3. **Configure `src-tauri/tauri.conf.json`:**
   - Set `"bundle": { "createUpdaterArtifacts": true }`.
   - Add `"plugins": { "updater": { "pubkey": "<PUBLIC_KEY>", "endpoints": ["https://github.com/<owner>/<repo>/releases/latest/download/latest.json"] } }`.
4. **Publish Update Manifest:**
   - Upload the generated `.exe` installer, `.sig` signature file, and `latest.json` (containing `version`, `notes`, `pub_date`, and `platforms["windows-x86_64"]` URL + Ed25519 signature) with every GitHub Release.
5. **Respect Wens Offline-First Privacy Contract:**
   - **Never** check for updates automatically when `prefs.strictOffline == true`.
   - Gate update checks behind an explicit user setting (`autoCheckUpdates`, opt-in or manual *"Check for Updates"* button in Settings), and update [`PRIVACY.md`](PRIVACY.md) to document the GitHub Releases `latest.json` endpoint.
