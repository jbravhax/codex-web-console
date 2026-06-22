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

  it("handles nested terminal control patterns while preserving visible text", () => {
    expect(stripTerminalSequences("Start\u001b[31mred\u001b]0;AIRE\u0007\u001b[0mDone")).toBe("StartredDone");
  });

  it("keeps the final visible text for carriage-return overwrite output", () => {
    expect(stripTerminalSequences("Progress 10%\rProgress 90%\rProgress 100%\nDone")).toBe("Progress 100%\nDone");
  });

  it("drops partial trailing control sequences without stripping meaningful text", () => {
    expect(stripTerminalSequences("Ready\u001b[31")).toBe("Ready");
    expect(stripTerminalSequences("Title\u001b]0;Codex")).toBe("Title");
  });

  it("preserves meaningful text when mixed with clear-screen and overwrite artifacts", () => {
    expect(stripTerminalSequences("hello\u001b[2J\rstatus: waiting\r\u001b[2Kstatus: done\nNext")).toBe("status: done\nNext");
  });
});
