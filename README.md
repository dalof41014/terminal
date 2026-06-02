# Tapterm

A modern, cross-platform **SSH / SFTP terminal client** built with **Tauri 2 + React + TypeScript**.
Developer-tool dark design system (IBM Plex Sans + JetBrains Mono, slate background with a green
"connect/run" accent), inspired by Termius.

## Features

| Area | What's implemented |
|------|--------------------|
| **SSH terminal** | Real PTY shell over `russh`, streamed to `xterm.js`. Multi-tab sessions, live resize, 10k scrollback. |
| **Terminal search** | In-terminal find (`Ctrl/Cmd+F`) with match highlighting and next/previous. |
| **Known-hosts verification** | Server keys are pinned (trust-on-first-use). A changed key is **refused** with a MITM warning. Manage trusted keys in the Known Hosts panel. |
| **Encrypted Vault** | Hosts, keys, snippets & forwards stored locally, encrypted with **AES-256-GCM** + **Argon2id** key derivation from a master password. Lock/unlock. |
| **Host groups** | Nested **group tree** with expand/collapse; assign hosts to groups, organize by environment. |
| **Keychain** | Store OpenSSH private keys (with passphrase) and reuse them across hosts. |
| **Auth** | Password, SSH key, or system agent. |
| **SFTP browser** | Browse remote directories, upload & download files via native dialogs. |
| **Snippets** | Save reusable commands and run them into the active terminal. |
| **Port forwarding** | Local / Remote / Dynamic rules, start & stop tunnels live. |
| **Cloud sync** | Two options: point the vault at a **synced folder** (Google Drive / Dropbox / OneDrive desktop), or **built-in Google Drive** (OAuth, stored in Drive's hidden app folder). Only ciphertext leaves the device. |
| **Auto-update** | Signed online updates delivered via GitHub Releases (`tauri-plugin-updater`). |
| **Frameless UI** | Custom title bar; the native window chrome is hidden. |

## Cloud sync

Open **Settings** (gear icon, top-right). Because the vault is end-to-end encrypted, the cloud only
ever stores ciphertext — use the same master password on every device.

- **Synced folder** — pick your Google Drive / Dropbox / OneDrive desktop folder; the OS sync client
  mirrors the vault file. Zero setup.
- **Google Drive (built-in)** — requires a one-time OAuth client:
  1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and **enable the Google Drive API**.
  2. Create an **OAuth client ID** of type **Desktop app**.
  3. Paste the Client ID + Secret in Settings → Connect Google Drive, and sign in.
  4. The app stores the encrypted vault in Drive's hidden `appDataFolder` (scope `drive.appdata`), pushes after each change, and pulls on launch.

## Architecture

```
src/                     React + TypeScript frontend
  components/            UI (sidebar, workspace, terminal, panels, modals, lists)
  store/useStore.ts      Zustand state + vault persistence
  lib/                   Tauri command bindings, updater, session helpers
src-tauri/src/
  lib.rs                 Tauri commands (bridge)
  ssh.rs                 russh shell / SFTP / port forwarding / host-key verification
  vault.rs               AES-256-GCM encrypted vault (Argon2id) + known-hosts
.github/workflows/release.yml   Cross-platform signed release + updater artifacts
```

## Develop

```bash
npm install
npm run tauri dev
```

## Release & auto-update (GitHub)

1. Repository secrets required (Settings → Secrets → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` — contents of the updater private key
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password (empty if none)
2. Bump the version in `src-tauri/tauri.conf.json` and `package.json`.
3. Tag and push:
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```
4. The **Release** workflow builds Windows/macOS/Linux installers, signs them, generates
   `latest.json`, and publishes a GitHub Release. Installed apps check
   `releases/latest/download/latest.json` and update themselves.

> The updater public key is committed in `tauri.conf.json`; the **private** key is never committed.

## Security notes

- Vault file: `%APPDATA%/Tapterm/vault.json` (Windows) / `~/.local/share/Tapterm/` — encrypted at rest (auto-migrated from the old `Terminal` folder).
- Host keys are pinned on first connect; remove a host from **Known Hosts** to re-trust after a legitimate key change.
