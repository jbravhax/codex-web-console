export async function loadSessionTranscript(
  sessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const response = await fetchImpl(`/api/sessions/${encodeURIComponent(sessionId)}/transcript`);

  if (!response.ok) {
    let message = "Could not load transcript.";

    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parse failures and keep the fallback error.
    }

    throw new Error(message);
  }

  return response.text();
}

function fallbackCopyText(text: string, doc: Document): void {
  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  doc.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const didCopy = doc.execCommand("copy");
    if (!didCopy) {
      throw new Error("Fallback copy failed.");
    }
  } finally {
    doc.body.removeChild(textarea);
  }
}

export async function copyTranscriptText(
  transcript: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard,
  doc: Document = document
): Promise<void> {
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(transcript);
      return;
    } catch {
      // Fall through to the document-based fallback.
    }
  }

  fallbackCopyText(transcript, doc);
}
