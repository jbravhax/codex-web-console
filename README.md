# Codex CLI Web Console

Codex CLI Web Console is a local-only browser interface for the official Codex CLI on Linux. It does not reimplement Codex. Instead, it starts the real `codex` process inside a pseudo-terminal on your machine and streams that terminal session into a web UI.

The result is a thin wrapper around the official CLI: you pick a directory, the server launches Codex in that directory, and the browser shows the live terminal, session history, settings, and a small read-only Git summary.

Large pasted context is also handled locally. When you paste a very large block of text into the prompt composer, the app saves it into the active repository under `.codex-web/documents/` and sends Codex a short file reference instead of stuffing the full text into the prompt box.

General attachments are handled locally too. Files uploaded from the browser, dragged into the prompt area, or pasted from the clipboard as images are saved into the active repository under `.codex-web/attachments/files/` and then referenced into the next prompt.

ZIP attachments are also supported locally. Uploaded `.zip` files are saved into `.codex-web/attachments/zips/`, safely extracted into `.codex-web/attachments/extracted/`, and passed to Codex as both the original ZIP path and the extracted folder path.

All of these inputs appear together in one pending-context area in the UI so you can review, remove, copy paths, or clear everything before sending the next prompt.

## What this is

- A local web console for the official Codex CLI
- A wrapper that runs Codex as a normal local terminal process
- A browser UI for starting a session, sending input, and viewing output
- A local-only tool intended to run on the same Linux machine as Codex
- A small TypeScript monorepo with a React frontend and Express backend

## What this is not

- Not a replacement for the official Codex CLI
- Not a hosted service or remote multi-user platform
- Not a sandbox by itself
- Not an authentication or access-control layer
- Not a database-backed session manager
- Not a general-purpose remote command runner

## How it works

1. The backend listens on `127.0.0.1` by default.
2. The frontend opens in your browser and connects to the backend over WebSocket.
3. When you start a session, the backend launches the official `codex` CLI in the selected directory using `node-pty`.
4. Terminal output is streamed to the browser.
5. Browser keystrokes are sent back to the running Codex process.

Because this wraps the official Codex CLI, Codex runs locally and can read files, modify files, and run commands in the selected directory, subject to Codex's own behavior and sandboxing configuration.

## Linux prerequisites

You should run this project on Linux, on the same machine where you use Codex.

Required:

- Node.js
- npm
- Git
- Codex CLI installed and available in `PATH`, or configured through settings
- `bubblewrap` available on the machine for Linux sandboxing support

Notes:

- Codex CLI is the actual tool doing the coding work.
- Linux sandboxing for Codex depends on `bubblewrap`.
- If `bubblewrap` is missing, Codex may fail to start or may not have the expected sandbox behavior.

## Tech stack

- Frontend: React + Vite + TypeScript
- Terminal UI: xterm.js
- Backend: Node.js + Express + TypeScript
- WebSocket: `ws`
- PTY: `node-pty`

## Project structure

- `apps/web`: browser frontend
- `apps/server`: local API server and PTY/session manager

## Install

1. Clone this repository onto your Linux machine.
2. Make sure `node`, `npm`, `git`, `codex`, and `bwrap` are available.
3. Install dependencies:

```bash
npm install
```

## Run locally

Start both the frontend and backend in development mode:

```bash
npm run dev
```

Useful scripts:

- `npm run dev`
- `npm run dev:web`
- `npm run dev:server`
- `npm run build`
- `npm run typecheck`

## Docker on Windows or macOS

If you are developing from Windows or macOS but targeting Linux behavior, Docker is a good way to raise confidence without moving the whole project first.

This repository includes:

- A default Linux dev/test container for the web console itself
- An optional Codex-enabled profile with a persistent container auth volume

### What Docker helps validate

- Node dependency installation
- Express and Vite startup behavior on Linux
- File upload and save paths
- ZIP extraction behavior
- PTY-related runtime wiring in a Linux container
- Tests running in a Linux environment

### What Docker does not fully prove by itself

- Your exact real-world Codex host setup
- Codex authentication unless you log in inside the container or mount credentials deliberately
- Full Linux sandbox behavior unless the container is configured to allow the required sandbox features

### Start the Linux app container

```bash
docker compose up --build app
```

Shortcut:

```bash
npm run docker:up
```

Open:

- `http://127.0.0.1:5173`

### Run the test suite in Linux

```bash
docker compose --profile test run --rm test
```

Shortcut:

```bash
npm run docker:test
```

### Codex-enabled container profile

The `codex` profile is optional and meant for deeper end-to-end validation.

Included services:

- `app-codex`: runs the web console with a persistent Codex auth volume
- `codex-shell`: opens an interactive shell in the same Linux container environment

Start an interactive shell:

```bash
docker compose --profile codex run --rm codex-shell
```

Shortcut:

```bash
npm run docker:codex:shell
```

From there, install or verify the Codex CLI using the current official method you prefer, then authenticate inside the container. The container persists Codex state in the named Docker volume mounted at:

```text
/root/.codex
```

That means you do not need to bake credentials into the image.

After authentication, you can run the Codex-enabled app profile:

```bash
docker compose --profile codex up --build app-codex
```

Shortcut:

```bash
npm run docker:codex
```

Open:

- `http://127.0.0.1:5174`

Notes:

- `app` uses ports `5173` and `8787`
- `app-codex` uses ports `5174` and `8788` to avoid conflicts
- The Codex profile uses a persistent Docker volume rather than copying tokens into the image
- The Codex profile adds broader container permissions because `bubblewrap`-style Linux sandbox behavior may otherwise fail inside Docker
- Do not run both `app` and `app-codex` at the same time unless you intentionally want both stacks

## Open the UI

After starting the app locally:

- Frontend: `http://127.0.0.1:5173`
- Backend default: `http://127.0.0.1:8787`

Open the frontend URL in a browser on the same machine.

## Configuration

Settings are stored as flat JSON in:

```text
~/.codex-web-console/config.json
```

Default configuration:

```json
{
  "codexExecutablePath": "codex",
  "defaultRepoRoot": "/home/you",
  "serverBindHost": "127.0.0.1",
  "serverPort": 8787,
  "theme": "dark"
}
```

Current settings include:

- Codex executable path
- Default repo root
- Server bind host
- Server port
- Theme

Notes:

- Host validation only allows `127.0.0.1` or `localhost`.
- Host or port changes require a server restart.
- The frontend only receives these explicit non-secret settings from the backend.

## Local storage

Session logs are stored as flat files under:

```text
~/.codex-web-console/sessions/
```

Each session gets its own folder containing:

- `metadata.json`
- `transcript.txt`

The metadata includes:

- Session id
- Repo path
- Start time
- End time
- Duration

Large pasted prompt context is stored inside the active repository under:

```text
.codex-web/documents/
```

The app also ensures `.codex-web/` is added to the repo's `.gitignore`.

Attachments are stored inside the active repository under:

```text
.codex-web/attachments/files/
```

ZIP uploads are stored under:

```text
.codex-web/attachments/zips/
```

Extracted ZIP contents are stored under:

```text
.codex-web/attachments/extracted/
```

## Context inputs in the UI

The prompt area supports four local context types:

- Large pasted documents
- Uploaded files
- Pasted images
- ZIP uploads with extracted folders

All pending items are shown together in one context list. Each item shows:

- A simple icon
- Name
- Type
- Size
- Relative path
- Remove action

The UI also supports:

- Copy relative path
- Clear all pending context
- Upload progress for larger files
- Clipboard fallback behavior when browser clipboard APIs are blocked
- Friendly empty state when nothing is pending

Removing an item only removes it from the next prompt context. It does not delete the saved file from disk.

## Repo selection

You can choose a repo in three ways:

- Paste a repo path manually
- Reuse a recent project from the recent-projects list
- Use the `Choose repo` button when the browser supports the File System Access API

Notes:

- The browser picker uses `window.showDirectoryPicker()` when available.
- Some browsers let you pick a folder but do not expose a usable absolute filesystem path back to the page.
- When that happens, the app does not guess or fake a path. It tells you to paste the project folder path manually instead.
- Manual path entry remains available in every browser.
- Codex still needs one real project folder, not a broad parent directory such as `/home/you/Projects`.

## Safety limits

Current local limits:

- Large pasted text is saved as a document at `10,000` characters or more
- Large pasted text maximum size: `1MB`
- Regular attachment upload maximum size: `10MB`
- ZIP upload maximum size: `50MB`
- ZIP extracted file count maximum: `2,000`
- ZIP total extracted size maximum: `100MB`
- ZIP single extracted file maximum: `25MB`

Unsupported files inside ZIP uploads are skipped and recorded in extraction metadata instead of failing the whole upload.
The UI summarizes skipped files in human-readable language so you can tell what was excluded and why.

## API surface

- `GET /health`
- `GET /api/settings`
- `POST /api/settings`
- `GET /api/recent-projects`
- `GET /api/sessions`
- `GET /api/sessions/:id/transcript`
- `GET /api/git/status?repoPath=`
- `GET /api/git/diff?repoPath=`
- `POST /api/documents`
- `POST /api/attachments`
- WebSocket: `/ws/session`

## Security model

This project is intentionally local-only and keeps its defaults conservative, but it is still a powerful developer tool.

Key points:

- The backend binds to `127.0.0.1` by default.
- There is no authentication.
- The app is designed to run on your own machine, not to be exposed to a network.
- The web UI does not execute arbitrary shell commands from the browser.
- The Git panel is read-only and only runs fixed `git status --porcelain --branch`, `git diff --no-ext-diff`, and `git diff --cached --no-ext-diff` commands.
- Session startup validates directories before launching Codex and rejects obvious dangerous paths.
- Settings exposed to the frontend are limited to explicit non-secret values.

Important trust boundary:

- The official Codex CLI is the component that can read, change, and run code in the selected directory.
- If you start Codex in a project, you are granting that local Codex process access consistent with its configuration and sandbox behavior.
- Linux sandboxing depends on `bubblewrap`, so your effective isolation is tied to the Codex CLI setup on that machine.

Do not expose this app to untrusted users.

## Known limitations

- One active Codex session per live browser connection
- No auth
- No user accounts
- No database
- No multi-project dashboard
- No transcript search UI yet
- Approval guidance is improved, but confirmation still happens in the Codex terminal flow
- Git status is summary-only
- Host and port changes require restarting the backend
- The app assumes Linux usage even though parts of the codebase are cross-platform

## Troubleshooting

### The UI loads, but starting a session fails

Check:

- `codex` is installed
- the configured executable path is correct
- the selected repo path exists
- the selected path is a directory
- the selected path looks like a project directory

### Codex does not start correctly on Linux

Check:

- Codex CLI works directly in a terminal
- `bubblewrap` is installed and available as `bwrap`
- the current Linux environment supports the sandbox setup Codex expects

### The browser cannot connect

Check:

- the backend is running
- the backend is listening on `127.0.0.1:8787`
- you restarted the server after changing host or port settings

### Git status does not appear

Check:

- a session is active
- the selected folder is a Git repository
- `git` is installed on the machine

Non-Git folders are handled gracefully and will show that the folder is not a repository.

### Settings save, but host or port do not change immediately

That is expected. Restart the backend after changing host or port.

## Future roadmap

- Multiple concurrent sessions
- Better transcript browsing and download
- Richer Git views, diffs, and file-level summaries
- Session restore and resume behavior
- Better approval UX around Codex actions
- Safer project picking and favorites
- Packaging for easier local installation
- Optional production deployment guidance for trusted single-user setups
