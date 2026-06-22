import { describe, expect, it, vi } from "vitest";
import { copyTextWithFallback } from "./clipboard";

describe("copyTextWithFallback", () => {
  it("uses navigator clipboard when available", async () => {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined)
    };

    await copyTextWithFallback("copied text", clipboard);

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

    await copyTextWithFallback("fallback transcript", clipboard, doc);

    expect(clipboard.writeText).toHaveBeenCalledWith("fallback transcript");
    expect(doc.createElement).toHaveBeenCalledWith("textarea");
    expect(doc.execCommand).toHaveBeenCalledWith("copy");
  });

  it("throws when both clipboard and fallback fail", async () => {
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

    await expect(copyTextWithFallback("fallback transcript", clipboard, doc)).rejects.toThrow("Fallback copy failed.");
  });
});
