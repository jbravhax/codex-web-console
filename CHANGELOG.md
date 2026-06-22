# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [0.3.0] - 2026-06-22

### Added

- Added clearer session trust states and browser guidance so users can tell when Codex is starting, actively working, waiting for approval, waiting for input, completed, disconnected, or failed.
- Added a minimal create-new-project flow that can create a folder, initialize Git, and add a starter `README.md` without leaving the app.
- Added transcript export actions for cleaned text, markdown, and raw terminal output when debugging is needed.

### Changed

- Improved session trust and approval guidance across the banner, terminal-adjacent messaging, and prompt-send flow.
- Improved session failure diagnostics so common startup, sandbox, permission, PTY, and disconnect failures are clearer and more actionable.
- Improved repo onboarding guidance so users are nudged toward one real project folder instead of broad parent directories.
- Improved transcript fidelity and readability while preserving access to raw terminal output when needed.
- Improved upload and ZIP validation messaging so accepted, skipped, and rejected context is easier to understand.
- Tuned large-paste, attachment, and context workflow guidance so users can better choose between direct paste, file upload, and ZIP upload.
- Expanded PTY session lifecycle coverage and observability with stronger automated coverage for session start, streamed output, stop, exit, and websocket cleanup behavior.

### Fixed

- Improved PTY session diagnostics by carrying lightweight lifecycle metadata such as session start time, process exit details, and websocket close context through the app.
- Improved transcript and clipboard reliability around edge-case browser behavior and terminal cleanup artifacts.

### Known limitations

- Approval flow is still terminal-driven rather than browser-native.
- Browser folder picker support is still limited by browser security and may not expose a usable absolute path.
- Linux sandbox behavior still depends on host `bubblewrap` and user namespace support.
- `multer` 1.x remains a known isolated and deferred dependency risk in the local upload path.

### Tests

- Verified server test suite: 85 passing tests.
- Verified web test suite: 96 passing tests.
- Verified typecheck and production build.

## [0.2.2] - 2026-06-22

### Changed

- Hardened transcript cleanup and improved transcript/clipboard reliability around edge-case browser behavior.
- Improved ZIP extraction messaging and source-repo handling confidence without weakening extraction safety protections.
- Reduced repeated web-app feedback logic through small helper extraction while keeping the existing app architecture intact.
- Split large frontend vendor bundles to remove the previous Vite chunk-size warning and improve build health.

### Fixed

- Improved handling of transcript terminal artifacts in automated coverage.
- Improved consistency of copy feedback across transcript, preview, diff, and path-copy actions.

### Tests

- Verified server test suite: 66 passing tests.
- Verified web test suite: 78 passing tests.
- Verified typecheck and production build.

## [0.2.1] - 2026-06-22

### Changed

- Clarified approval and waiting guidance so the app explains when to keep focus on the terminal and how to approve or cancel follow-up requests.
- Improved repo and project-folder messaging so users are guided toward one real project folder instead of broad parent directories.
- Added a shared clipboard utility with fallback copy behavior so transcript, diff, preview, and path-copy actions behave more consistently across browsers.
- Converted ZIP skipped-file summaries into human-readable reasons to make extraction outcomes easier to trust at a glance.
- Tightened trust and workflow clarity across prompt sending, repo picking, pending context review, and session guidance surfaces.

### Tests

- Expanded automated coverage to 71 web tests and 59 server tests for the stabilization pass.

## [0.2.0] - 2026-06-21

### Added

- Session status banner covering idle, connecting, running, stopping, stopped, and failed states.
- Recent projects storage and UI for quickly reopening repositories.
- Prompt context preview showing exactly what Codex will receive before send.
- Session history transcript viewer with transcript copy support.
- Read-only Git status and diff panels for active sessions.
- Browser repo picker support with clear fallback messaging when the full path is unavailable.
- Large-paste document workflow that saves oversized pasted context into local markdown files.
- Local attachment handling for files, pasted images, and ZIP uploads with safe extraction metadata.
- Rendered-app integration coverage for repo picker, session banner, prompt preview, transcript viewer, and diff viewer flows.

### Changed

- Improved Git changed-file counting so staged-only, unstaged-only, and mixed tracked changes are represented correctly.
- Refined the web console layout and split UI render concerns into clearer frontend modules.
- Expanded README documentation for local-only behavior, API surface, repo picker behavior, and context storage.

### Notes

- This release remains local-only and keeps flat-file session, settings, recent-project, document, and attachment storage.
- No authentication, database, cloud storage, or remote execution layer has been added.
