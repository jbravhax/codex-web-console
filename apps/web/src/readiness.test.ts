import { describe, expect, it, vi } from "vitest";
import { loadReadiness } from "./readiness";

describe("loadReadiness", () => {
  it("loads a readiness summary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        overallStatus: "passed",
        canStart: true,
        checkedAt: "2026-06-22T21:30:00.000Z",
        repoPath: "/workspace/project",
        items: []
      })
    });

    await expect(loadReadiness("/workspace/project", fetchImpl as never)).resolves.toMatchObject({
      overallStatus: "passed",
      canStart: true
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/readiness?repoPath=%2Fworkspace%2Fproject");
  });

  it("throws the server error when readiness fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Codex is not available as codex."
      })
    });

    await expect(loadReadiness("/workspace/project", fetchImpl as never)).rejects.toThrow(
      "Codex is not available as codex."
    );
  });
});
