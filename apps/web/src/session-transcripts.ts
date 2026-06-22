import { copyTextWithFallback } from "./clipboard";

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
export async function copyTranscriptText(
  transcript: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard,
  doc: Document = document
): Promise<void> {
  await copyTextWithFallback(transcript, clipboard, doc);
}
