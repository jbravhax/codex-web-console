# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

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
