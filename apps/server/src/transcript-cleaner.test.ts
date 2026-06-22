import { describe, expect, it } from "vitest";
import { stripTerminalSequences } from "./transcript-cleaner.js";

describe("stripTerminalSequences", () => {
  it("removes ANSI color sequences while preserving visible text", () => {
    expect(stripTerminalSequences("\u001b[31mError\u001b[39m\n")).toBe("Error\n");
  });

  it("removes cursor movement and clear-screen sequences", () => {
    expect(stripTerminalSequences("hello\u001b[2J\u001b[1;1Hworld")).toBe("helloworld");
  });

  it("removes OSC window title sequences and preserves mixed content", () => {
    expect(stripTerminalSequences("Start\u001b]0;AIRE\u0007\nDone")).toBe("Start\nDone");
  });

  it("collapses simple backspace overwrite sequences", () => {
    expect(stripTerminalSequences("ab\u0008c")).toBe("ac");
  });
});
