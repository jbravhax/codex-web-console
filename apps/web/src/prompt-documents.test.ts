import { describe, expect, it } from "vitest";
import { buildPromptWithDocumentContext, classifyPaste } from "./prompt-documents";

describe("classifyPaste", () => {
  it("treats small paste content as inline text", () => {
    expect(classifyPaste("short paste")).toEqual({ kind: "small" });
  });

  it("keeps 9,999 characters inline", () => {
    expect(classifyPaste("a".repeat(9_999))).toEqual({ kind: "small" });
  });

  it("treats 10,000 characters or more as a large paste", () => {
    expect(classifyPaste("a".repeat(10_000))).toEqual({ kind: "large" });
  });

  it("returns actionable guidance when a paste exceeds the byte limit", () => {
    expect(classifyPaste("x".repeat(1_000_001))).toEqual({
      kind: "too-large",
      message:
        "That paste is larger than 1MB. Split it into smaller pieces, attach an existing file instead, or upload a ZIP if this is a larger project bundle."
    });
  });
});

describe("buildPromptWithDocumentContext", () => {
  it("adds saved document guidance to the next prompt", () => {
    const prompt = buildPromptWithDocumentContext("Review this", [
      {
        filePath: "/tmp/example.md",
        relativePath: ".codex-web/documents/pasted-20260621-120000.md",
        charCount: 12_345
      }
    ]);

    expect(prompt).toContain("Review this");
    expect(prompt).toContain("Large pasted context was saved to: .codex-web/documents/pasted-20260621-120000.md");
  });
});
