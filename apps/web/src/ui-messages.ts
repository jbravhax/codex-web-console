export function friendlyUploadErrorMessage(message: string): string {
  if (message.includes("Connection to the local Codex server was closed")) {
    return "The local Codex server connection closed. Restart the local server if needed, then try again.";
  }

  if (message.includes("not ready yet")) {
    return "The local Codex server is still connecting. Give it a moment and try again.";
  }

  if (message.includes("Unsupported file type")) {
    return "That file type is not supported here. Use a supported document, image, PDF, or ZIP file.";
  }

  if (message.includes("1MB")) {
    return "That pasted text is too large. Split it into smaller pieces before saving it as local context.";
  }

  if (message.includes("10MB")) {
    return "That file is too large. Regular attachments currently support up to 10MB.";
  }

  if (message.includes("50MB")) {
    return "That ZIP file is too large. ZIP uploads currently support up to 50MB.";
  }

  if (
    message.includes("does not exist") ||
    message.includes("not a directory") ||
    message.includes("project") ||
    message.includes("Refusing to start Codex") ||
    message.includes("Start a Codex session before")
  ) {
    return "Start a Codex session in a real project folder before adding saved context or attachments.";
  }

  if (message.includes("Choose a file to attach")) {
    return "Choose a file before trying to attach it.";
  }

  if (message.includes("Attachment is empty") || message.includes("Pasted content is empty")) {
    return "That item is empty, so there is nothing useful to send to Codex.";
  }

  if (message.includes("ZIP")) {
    return `ZIP extraction failed: ${message}`;
  }

  return message;
}
