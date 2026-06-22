function stripActionPrefix(message: string): string {
  return message
    .replace(/^Could not save pasted context\.?\s*/i, "")
    .replace(/^Could not upload attachment\.?\s*/i, "")
    .replace(/^Could not upload dropped files\.?\s*/i, "")
    .replace(/^Could not save pasted image\.?\s*/i, "")
    .trim();
}

export function friendlyUploadErrorMessage(message: string): string {
  const normalizedMessage = stripActionPrefix(message);

  if (message.includes("Connection to the local Codex server was closed")) {
    return "The local Codex server connection closed. Restart the local server if needed, then try again.";
  }

  if (normalizedMessage.includes("not ready yet")) {
    return "The local Codex server is still connecting. Give it a moment and try again.";
  }

  if (normalizedMessage.includes("Unsupported file type") || normalizedMessage.includes("not supported for attachments")) {
    return "Could not add that file. Paste short text directly, attach a supported document/image/PDF as a file, or use a ZIP when you want Codex to inspect a larger folder or repo.";
  }

  if (normalizedMessage.includes("1MB")) {
    return "Could not save that pasted text. It is over the current 1MB limit, so split it into smaller pieces, attach an existing file instead, or upload a ZIP for a larger project bundle.";
  }

  if (normalizedMessage.includes("10MB")) {
    return "Could not upload that file. Regular attachments currently support up to 10MB. For larger project context, attach a ZIP or trim the file first.";
  }

  if (normalizedMessage.includes("50MB")) {
    return "Could not upload that ZIP file. ZIP uploads currently support up to 50MB. Trim large binaries or split the archive into smaller reviewable parts.";
  }

  if (normalizedMessage.includes("Start a Codex session before")) {
    return "Start a Codex session in a real project folder before adding saved context or attachments.";
  }

  if (normalizedMessage.includes("does not exist")) {
    return "That project folder does not exist yet. Create it first, then start Codex in that specific project folder.";
  }

  if (normalizedMessage.includes("not a directory")) {
    return "That path points to a file, not a project folder. Enter a specific project folder instead.";
  }

  if (normalizedMessage.includes("broad parent directory")) {
    return "That folder looks like a parent directory that contains multiple projects. Open one specific project folder inside it instead of the parent Projects folder.";
  }

  if (normalizedMessage.includes("does not look like a project")) {
    return "That folder does not look like a project yet. Choose a folder that already contains project files like .git, README.md, package.json, pyproject.toml, or Cargo.toml. Git metadata is helpful but not required if another recognizable project file is present.";
  }

  if (normalizedMessage.includes("specific folder inside /home")) {
    return "Use a specific project folder inside /home, not /home itself or a broad parent directory.";
  }

  if (normalizedMessage.includes("Refusing to start Codex")) {
    return normalizedMessage;
  }

  if (normalizedMessage.includes("Choose a file to attach")) {
    return "Choose a file before trying to attach it.";
  }

  if (normalizedMessage.includes("Attachment is empty") || normalizedMessage.includes("Pasted content is empty")) {
    return "That item is empty, so there is nothing useful to send to Codex.";
  }

  if (normalizedMessage.includes("path traversal")) {
    return "Could not finish the ZIP upload. The archive contains a suspicious nested path that could escape the extracted folder. Re-create the ZIP from a normal project folder and try again.";
  }

  if (normalizedMessage.includes("absolute path entry")) {
    return "Could not finish the ZIP upload. The archive contains files stored with absolute paths, which is unsafe to extract here. Re-create the ZIP from inside the project folder and try again.";
  }

  if (normalizedMessage.includes("symlink")) {
    return "Could not finish the ZIP upload. The archive contains symlinks, which are blocked for safety. Re-create the ZIP with regular files only and try again.";
  }

  if (normalizedMessage.includes("valid .zip file")) {
    return "Could not finish the ZIP upload. This file could not be read as a valid ZIP archive. Re-create the archive from the project folder and try again.";
  }

  if (normalizedMessage.includes("too many extractable files")) {
    return "Could not finish the ZIP upload. The archive contains more than 2,000 reviewable files. Split it into smaller parts or narrow it to the area you want Codex to inspect.";
  }

  if (normalizedMessage.includes("100MB total extracted size")) {
    return "Could not finish the ZIP upload. The reviewable contents exceed the current 100MB extracted-size limit. Remove large generated artifacts or split the archive into smaller pieces.";
  }

  if (normalizedMessage.includes("25MB extracted-file limit")) {
    return "Could not finish the ZIP upload. At least one extracted file is over the current 25MB per-file limit. Trim that file or remove large build artifacts before zipping.";
  }

  if (normalizedMessage.includes("ZIP")) {
    return `Could not finish the ZIP upload. ${normalizedMessage}`;
  }

  if (message.startsWith("Could not save pasted context")) {
    return `Could not save pasted context. ${normalizedMessage || "Try again in an active project session."}`.trim();
  }

  if (
    message.startsWith("Could not upload attachment") ||
    message.startsWith("Could not upload dropped files") ||
    message.startsWith("Could not save pasted image")
  ) {
    return `Could not add that context item. ${normalizedMessage || "Try again in an active project session."}`.trim();
  }

  return normalizedMessage || message;
}
