import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTranscriptMarkdown,
  copyTranscriptText,
  downloadRawTranscript,
  downloadTranscriptMarkdown,
  downloadTranscriptText,
  loadSessionTranscript
} from "./session-transcripts";
import type { SessionHistoryItem } from "./app-types";

const session: SessionHistoryItem = {
  id: "session-123",
  repoPath: "/workspace/example-repo",
  startTime: "2026-06-21T12:00:00.000Z",
  endTime: "2026-06-21T12:05:00.000Z",
  durationMs: 300000,
  nativeSessionId: "019dd81b-cdcd-7da1-8b5a-ee131f2f004a",
  resumeAvailable: false
};

beforeEach(() => {
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined)
    }
  });
});

describe("session transcript helpers", () => {
  it("loads transcript text from the transcript endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("codex transcript output")
    });

    await expect(loadSessionTranscript("session-123", fetchImpl as never)).resolves.toBe("codex transcript output");
    expect(fetchImpl).toHaveBeenCalledWith("/api/sessions/session-123/transcript");
  });

  it("loads raw transcript text from the raw transcript endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("\u001b[31mraw terminal output")
    });

    await expect(loadSessionTranscript("session-123", "raw", fetchImpl as never)).resolves.toBe(
      "\u001b[31mraw terminal output"
    );
    expect(fetchImpl).toHaveBeenCalledWith("/api/sessions/session-123/transcript?format=raw");
  });

  it("surfaces transcript endpoint errors gracefully", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Session transcript not found." })
    });

    await expect(loadSessionTranscript("missing-session", fetchImpl as never)).rejects.toThrow(
      "Session transcript not found."
    );
  });

  it("copies transcript text", async () => {
    await copyTranscriptText("copied transcript");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("copied transcript");
  });

  it("falls back to document copy when clipboard write fails", async () => {
    const clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error("clipboard blocked"))
    };
    const textarea = {
      value: "",
      setAttribute: vi.fn(),
      style: {} as CSSStyleDeclaration,
      focus: vi.fn(),
      select: vi.fn()
    } as unknown as HTMLTextAreaElement;
    const doc = {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      createElement: vi.fn().mockReturnValue(textarea),
      execCommand: vi.fn().mockReturnValue(true)
    } as unknown as Document;

    await copyTranscriptText("fallback transcript", clipboard, doc);

    expect(clipboard.writeText).toHaveBeenCalledWith("fallback transcript");
    expect(doc.createElement).toHaveBeenCalledWith("textarea");
    expect(doc.execCommand).toHaveBeenCalledWith("copy");
  });

  it("surfaces failure when clipboard and fallback both fail", async () => {
    const clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error("clipboard blocked"))
    };
    const doc = {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      createElement: vi.fn().mockReturnValue({
        value: "",
        setAttribute: vi.fn(),
        style: {} as CSSStyleDeclaration,
        focus: vi.fn(),
        select: vi.fn()
      }),
      execCommand: vi.fn().mockReturnValue(false)
    } as unknown as Document;

    await expect(copyTranscriptText("fallback transcript", clipboard, doc)).rejects.toMatchObject({
      code: "copy-failed",
      clipboardBlocked: true
    });
  });

  it("builds a markdown export with session metadata and transcript content", () => {
    const markdown = buildTranscriptMarkdown(session, "codex transcript output");

    expect(markdown).toContain("# Codex Session Transcript");
    expect(markdown).toContain("- Repo path: /workspace/example-repo");
    expect(markdown).toContain("- Session ID: 019dd81b-cdcd-7da1-8b5a-ee131f2f004a");
    expect(markdown).toContain("```text");
    expect(markdown).toContain("codex transcript output");
  });

  it("downloads cleaned transcript and raw transcript variants", () => {
    const anchor = {
      href: "",
      download: "",
      style: {} as CSSStyleDeclaration,
      click: vi.fn()
    } as unknown as HTMLAnchorElement;
    const doc = {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      createElement: vi.fn().mockReturnValue(anchor)
    } as unknown as Document;
    const urlFactory = {
      createObjectURL: vi.fn().mockReturnValue("blob:transcript"),
      revokeObjectURL: vi.fn()
    } as unknown as typeof URL;

    downloadTranscriptText(session, "clean transcript", doc, urlFactory);
    expect(anchor.download).toContain("019dd81b-cdcd-7da1-8b5a-ee131f2f004a.txt");
    expect(anchor.click).toHaveBeenCalledTimes(1);

    downloadTranscriptMarkdown(session, "clean transcript", doc, urlFactory);
    expect(anchor.download).toContain("019dd81b-cdcd-7da1-8b5a-ee131f2f004a.md");

    downloadRawTranscript(session, "\u001b[31mraw", doc, urlFactory);
    expect(anchor.download).toContain("019dd81b-cdcd-7da1-8b5a-ee131f2f004a-raw.txt");
  });
});
