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

export async function copyTextWithFallback(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard,
  doc: Document = document
): Promise<void> {
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the document-based fallback.
    }
  }

  fallbackCopyText(text, doc);
}
