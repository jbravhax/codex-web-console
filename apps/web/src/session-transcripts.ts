import { copyTextWithFallback } from "./clipboard";
import type { SessionHistoryItem } from "./app-types";

export type TranscriptFormat = "clean" | "raw";

function buildTranscriptUrl(sessionId: string, format: TranscriptFormat = "clean"): string {
  if (format === "raw") {
    return `/api/sessions/${encodeURIComponent(sessionId)}/transcript?format=raw`;
  }

  return `/api/sessions/${encodeURIComponent(sessionId)}/transcript`;
}

export async function loadSessionTranscript(
  sessionId: string,
  formatOrFetchImpl: TranscriptFormat | typeof fetch = "clean",
  maybeFetchImpl?: typeof fetch
): Promise<string> {
  const format = typeof formatOrFetchImpl === "function" ? "clean" : formatOrFetchImpl;
  const fetchImpl = (typeof formatOrFetchImpl === "function" ? formatOrFetchImpl : maybeFetchImpl) ?? fetch;
  const response = await fetchImpl(buildTranscriptUrl(sessionId, format));

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
) {
  return copyTextWithFallback(transcript, clipboard, doc);
}

function createDownloadLink(doc: Document, blob: Blob, fileName: string, urlFactory: typeof URL): HTMLAnchorElement {
  const url = urlFactory.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  doc.body.appendChild(link);
  link.click();
  doc.body.removeChild(link);
  urlFactory.revokeObjectURL(url);
  return link;
}

function sanitizeFileNameSegment(input: string): string {
  return input.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "session";
}

export function buildTranscriptExportBaseName(session: SessionHistoryItem): string {
  const repoName = sanitizeFileNameSegment(session.repoPath.split(/[\\/]/).filter(Boolean).pop() ?? session.id);
  const sessionIdentifier = sanitizeFileNameSegment(session.nativeSessionId ?? session.id);
  return `${repoName}-${sessionIdentifier}`;
}

export function buildTranscriptMarkdown(session: SessionHistoryItem, transcript: string): string {
  const lines = [
    "# Codex Session Transcript",
    "",
    `- Repo path: ${session.repoPath}`,
    `- Session ID: ${session.nativeSessionId ?? "Unavailable"}`,
    `- Start time: ${new Date(session.startTime).toISOString()}`,
    `- End time: ${session.endTime ? new Date(session.endTime).toISOString() : "In progress"}`,
    `- Duration: ${session.durationMs === null ? "In progress" : `${Math.round(session.durationMs / 1000)}s`}`,
    "",
    "```text",
    transcript,
    "```",
    ""
  ];

  return lines.join("\n");
}

export function downloadTranscriptText(
  session: SessionHistoryItem,
  transcript: string,
  doc: Document = document,
  urlFactory: typeof URL = URL
): void {
  createDownloadLink(doc, new Blob([transcript], { type: "text/plain;charset=utf-8" }), `${buildTranscriptExportBaseName(session)}.txt`, urlFactory);
}

export function downloadTranscriptMarkdown(
  session: SessionHistoryItem,
  transcript: string,
  doc: Document = document,
  urlFactory: typeof URL = URL
): void {
  createDownloadLink(
    doc,
    new Blob([buildTranscriptMarkdown(session, transcript)], { type: "text/markdown;charset=utf-8" }),
    `${buildTranscriptExportBaseName(session)}.md`,
    urlFactory
  );
}

export function downloadRawTranscript(
  session: SessionHistoryItem,
  transcript: string,
  doc: Document = document,
  urlFactory: typeof URL = URL
): void {
  createDownloadLink(
    doc,
    new Blob([transcript], { type: "text/plain;charset=utf-8" }),
    `${buildTranscriptExportBaseName(session)}-raw.txt`,
    urlFactory
  );
}
