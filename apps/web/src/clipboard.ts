export type CopyTextResult = {
  method: "clipboard" | "fallback";
  clipboardBlocked: boolean;
};

export class CopyTextError extends Error {
  constructor(
    public readonly code: "clipboard-blocked" | "fallback-unavailable" | "copy-failed",
    public readonly clipboardBlocked: boolean
  ) {
    super(code);
    this.name = "CopyTextError";
  }
}

function canUseFallback(doc: Document | undefined): doc is Document {
  return Boolean(doc?.body && typeof doc.createElement === "function" && typeof doc.execCommand === "function");
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

export async function copyTextWithFallback(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard,
  doc: Document = document
): Promise<CopyTextResult> {
  let clipboardBlocked = false;

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return {
        method: "clipboard",
        clipboardBlocked: false
      };
    } catch {
      clipboardBlocked = true;
    }
  }

  if (!canUseFallback(doc)) {
    throw new CopyTextError(clipboardBlocked ? "clipboard-blocked" : "fallback-unavailable", clipboardBlocked);
  }

  try {
    fallbackCopyText(text, doc);
    return {
      method: "fallback",
      clipboardBlocked
    };
  } catch {
    throw new CopyTextError("copy-failed", clipboardBlocked);
  }
}
