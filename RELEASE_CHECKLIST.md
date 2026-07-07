# Release Checklist & Signing Key Management

This document details the release and signing key verification process for the ARK Server Manager auto-update system. Follow this checklist on every release to prevent update signature mismatches.

---

## 🔑 Key Concepts & Configuration

Tauri's updater uses **Minisign** (Ed25519) to sign and verify releases.
* **Public Key:** Embedded in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
* **Private Key:** Stored as `TAURI_SIGNING_PRIVATE_KEY` in GitHub Repository Secrets.
* **Password:** Stored as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub Repository Secrets (empty if no password).

---

## 🚀 Pre-Release / Key-Rotation Checklist

If you ever need to generate a new signing key or recover from a lost key:

1. **Generate a New Keypair:**
   Run the following command in your terminal:
   ```bash
   npx @tauri-apps/cli signer generate --ci
   ```
   This generates a private key (`signing_key`) and public key (`signing_key.pub`) in your folder.

2. **Update Public Key in App Config:**
   Open `src-tauri/tauri.conf.json` and update the `plugins.updater.pubkey` field with the content of the generated public key (`signing_key.pub`).

3. **Update Private Key in GitHub Secrets:**
   * Go to your repository on GitHub.
   * Navigate to **Settings** → **Secrets and variables** → **Actions**.
   * Update the following secrets:
     * `TAURI_SIGNING_PRIVATE_KEY`: Copy the content of the generated private key file (`signing_key`).
     * `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Keep empty or update if you set a password.

4. **Clean Up Local Files:**
   Immediately delete the generated local private and public key files to prevent accidentally committing them to version control.

---

## 🛠️ Automated CI Verification Step

The GitHub Actions workflow `.github/workflows/build.yml` has a built-in verification step:
```yaml
      - name: Verify Release Signatures
        run: node scripts/verify-release-signatures.js
```
This script executes automatically after compilation. It:
1. Loads the public key from `src-tauri/tauri.conf.json`.
2. Scans the build output directory for all generated `.sig` signature files.
3. Cryptographically verifies each update package against the configured public key.
4. Fails the build loudly if there is a signature mismatch, preventing bad releases from reaching users.

---

## 🚑 Recovery Path for Affected Users (Manual Fallback)

If a signature mismatch occurs in production (e.g., during v4.5.4 → v4.5.5 update):
* The `UpdateChecker` component detects the verification failure and displays a clear message directing users to manual downloads.
* Instruct affected users to manually download the new installer from the GitHub Releases page.
* Once they install the new version (which includes the updated public key), future auto-updates will work seamlessly.
