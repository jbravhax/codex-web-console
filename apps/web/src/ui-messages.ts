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
    return "Could not add that file. Use a supported document, image, PDF, or ZIP file.";
  }

  if (normalizedMessage.includes("1MB")) {
    return "Could not save that pasted text. It is over the current 1MB limit, so split it into smaller pieces first.";
  }

  if (normalizedMessage.includes("10MB")) {
    return "Could not upload that file. Regular attachments currently support up to 10MB.";
  }

  if (normalizedMessage.includes("50MB")) {
    return "Could not upload that ZIP file. ZIP uploads currently support up to 50MB.";
  }

  if (normalizedMessage.includes("Start a Codex session before")) {
    return "Start a Codex session in a real project folder before adding saved context or attachments.";
  }

  if (normalizedMessage.includes("does not exist")) {
    return "That path does not exist yet. Create the folder first, then start Codex in that specific project folder.";
  }

  if (normalizedMessage.includes("not a directory")) {
    return "That path points to a file. Enter a specific project folder instead.";
  }

  if (normalizedMessage.includes("does not look like a project")) {
    return "That folder does not look like a project yet. Choose a specific project folder or add .git, README.md, package.json, pyproject.toml, or Cargo.toml first.";
  }

  if (normalizedMessage.includes("specific folder inside /home")) {
    return "Use a specific project folder inside /home, not /home itself.";
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
