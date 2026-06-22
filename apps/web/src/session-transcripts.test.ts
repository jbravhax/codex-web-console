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
});
