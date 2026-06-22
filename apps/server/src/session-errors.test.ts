import { describe, expect, it } from "vitest";
import { classifySessionExit, classifySessionStartupError } from "./session-errors.js";

describe("classifySessionStartupError", () => {
  it("categorizes missing repo paths", () => {
    expect(classifySessionStartupError(new Error("The path does not exist: /workspace/missing"))).toMatchObject({
      category: "repo-path-does-not-exist"
    });
  });

  it("categorizes missing codex executables", () => {
    const error = new Error("spawn codex ENOENT") as Error & { code: string };
    error.code = "ENOENT";
    expect(classifySessionStartupError(error)).toMatchObject({
      category: "codex-not-found"
    });
  });
});

describe("classifySessionExit", () => {
  it("categorizes sandbox failures from recent output", () => {
    expect(
      classifySessionExit(1, 0, "bubblewrap needs access to create user namespaces", "/workspace/project")
    ).toMatchObject({
      category: "sandbox-unavailable"
    });
  });

  it("categorizes unexpected nonzero exits", () => {
    expect(classifySessionExit(1, 0, "unexpected failure", "/workspace/project")).toMatchObject({
      category: "process-exited-unexpectedly"
    });
  });
});
