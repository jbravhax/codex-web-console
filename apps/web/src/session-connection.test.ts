import { describe, expect, it } from "vitest";
import { buildSessionWebSocketUrl } from "./session-connection";

describe("buildSessionWebSocketUrl", () => {
  it("uses the current origin host for local dev", () => {
    expect(buildSessionWebSocketUrl({ protocol: "http:", host: "127.0.0.1:5173" })).toBe(
      "ws://127.0.0.1:5173/ws/session"
    );
  });

  it("uses the current origin host for alternate local ports", () => {
    expect(buildSessionWebSocketUrl({ protocol: "http:", host: "127.0.0.1:5174" })).toBe(
      "ws://127.0.0.1:5174/ws/session"
    );
  });

  it("uses secure websocket protocol on https pages", () => {
    expect(buildSessionWebSocketUrl({ protocol: "https:", host: "example.test" })).toBe(
      "wss://example.test/ws/session"
    );
  });
});
