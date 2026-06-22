import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getGitDiffMock = vi.fn();

vi.mock("./git-diff.js", () => ({
  getGitDiff: getGitDiffMock
}));

const { createApp } = await import("./app.js");

describe("GET /api/git/diff", () => {
  beforeEach(() => {
    getGitDiffMock.mockReset();
  });

  it("returns staged and unstaged diff text", async () => {
    getGitDiffMock.mockResolvedValue({
      repoPath: "/workspace/project",
      isGitRepo: true,
      stagedDiff: "diff --git a/a.ts b/a.ts\n",
      unstagedDiff: "diff --git a/b.ts b/b.ts\n"
    });

    const app = createApp({
      getConfig: vi.fn(),
      setConfig: vi.fn(),
      sessionManager: {
        listSessions: vi.fn(),
        getTranscript: vi.fn()
      },
      recentProjects: {
        listRecentProjects: vi.fn()
      }
    } as never);

    const response = await request(app).get("/api/git/diff").query({ repoPath: "/workspace/project" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      repoPath: "/workspace/project",
      isGitRepo: true,
      stagedDiff: "diff --git a/a.ts b/a.ts\n",
      unstagedDiff: "diff --git a/b.ts b/b.ts\n"
    });
  });

  it("surfaces route errors as bad requests", async () => {
    getGitDiffMock.mockRejectedValue(new Error("Could not read Git diff for this folder."));

    const app = createApp({
      getConfig: vi.fn(),
      setConfig: vi.fn(),
      sessionManager: {
        listSessions: vi.fn(),
        getTranscript: vi.fn()
      },
      recentProjects: {
        listRecentProjects: vi.fn()
      }
    } as never);

    const response = await request(app).get("/api/git/diff").query({ repoPath: "/workspace/project" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Could not read Git diff for this folder."
    });
  });
});
