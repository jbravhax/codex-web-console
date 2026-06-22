import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("GET /api/readiness", () => {
  it("returns a structured readiness summary", async () => {
    const app = createApp({
      getConfig: () => ({
        codexExecutablePath: "codex",
        defaultRepoRoot: "/workspace",
        serverBindHost: "127.0.0.1",
        serverPort: 8787,
        theme: "dark"
      }),
      setConfig: () => {},
      sessionManager: {
        listSessions: () => []
      },
      recentProjects: {
        listRecentProjects: () => []
      }
    } as never);

    const response = await request(app).get("/api/readiness").query({ repoPath: "/workspace/project" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      overallStatus: expect.any(String),
      canStart: expect.any(Boolean),
      checkedAt: expect.any(String),
      repoPath: "/workspace/project",
      items: expect.any(Array)
    });
  });
});
