import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { createApp } = await import("./app.js");

describe("GET /api/sessions/:id/transcript", () => {
  it("returns the cleaned transcript by default", async () => {
    const app = createApp({
      getConfig: vi.fn(),
      setConfig: vi.fn(),
      sessionManager: {
        listSessions: vi.fn(),
        getTranscript: vi.fn().mockReturnValue("clean transcript"),
        getRawTranscript: vi.fn().mockReturnValue("raw transcript")
      },
      recentProjects: {
        listRecentProjects: vi.fn()
      }
    } as never);

    const response = await request(app).get("/api/sessions/session-1/transcript");

    expect(response.status).toBe(200);
    expect(response.text).toBe("clean transcript");
  });

  it("returns the raw transcript when requested", async () => {
    const app = createApp({
      getConfig: vi.fn(),
      setConfig: vi.fn(),
      sessionManager: {
        listSessions: vi.fn(),
        getTranscript: vi.fn().mockReturnValue("clean transcript"),
        getRawTranscript: vi.fn().mockReturnValue("\u001b[31mraw transcript")
      },
      recentProjects: {
        listRecentProjects: vi.fn()
      }
    } as never);

    const response = await request(app).get("/api/sessions/session-1/transcript").query({ format: "raw" });

    expect(response.status).toBe(200);
    expect(response.text).toBe("\u001b[31mraw transcript");
  });
});
