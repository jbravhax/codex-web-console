import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyTranscriptText, loadSessionTranscript } from "./session-transcripts";

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
});
