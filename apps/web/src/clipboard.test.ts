import { describe, expect, it, vi } from "vitest";
import { CopyTextError, copyTextWithFallback } from "./clipboard";

describe("copyTextWithFallback", () => {
  it("uses navigator clipboard when available", async () => {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined)
    };

    await expect(copyTextWithFallback("copied text", clipboard)).resolves.toEqual({
      method: "clipboard",
      clipboardBlocked: false
    });

    expect(clipboard.writeText).toHaveBeenCalledWith("copied text");
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

    await expect(copyTextWithFallback("fallback transcript", clipboard, doc)).resolves.toEqual({
      method: "fallback",
      clipboardBlocked: true
    });

    expect(clipboard.writeText).toHaveBeenCalledWith("fallback transcript");
    expect(doc.createElement).toHaveBeenCalledWith("textarea");
    expect(doc.execCommand).toHaveBeenCalledWith("copy");
  });

  it("throws a structured error when clipboard is blocked and fallback copy fails", async () => {
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

    await expect(copyTextWithFallback("fallback transcript", clipboard, doc)).rejects.toMatchObject({
      code: "copy-failed",
      clipboardBlocked: true
    });
  });

  it("throws a structured error when no clipboard fallback is available", async () => {
    await expect(
      copyTextWithFallback("copied text", {} as Pick<Clipboard, "writeText">, undefined as unknown as Document)
    ).rejects.toMatchObject({
      code: "fallback-unavailable",
      clipboardBlocked: false
    });
  });
});
