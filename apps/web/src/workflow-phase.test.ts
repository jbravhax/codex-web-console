import { describe, expect, it } from "vitest";
import {
  deriveWorkspaceState,
  isLiveRunWorkspaceState,
  isResultsWorkspaceState,
  recommendUtilityMode
} from "./workflow-phase";

describe("workflow-phase", () => {
  it("derives ready-to-compose when prompt or pending context exists", () => {
    expect(
      deriveWorkspaceState({
        sessionBannerState: "idle",
        promptText: "Review this file",
        readyPendingItemCount: 0
      })
    ).toBe("ready-to-compose");

    expect(
      deriveWorkspaceState({
        sessionBannerState: "idle",
        promptText: "",
        readyPendingItemCount: 1
      })
    ).toBe("ready-to-compose");
  });

  it("derives live run states from session activity", () => {
    expect(
      deriveWorkspaceState({
        sessionBannerState: "starting",
        promptText: "",
        readyPendingItemCount: 0
      })
    ).toBe("running");

    expect(
      deriveWorkspaceState({
        sessionBannerState: "awaiting-approval",
        promptText: "",
        readyPendingItemCount: 0
      })
    ).toBe("awaiting-approval");

    expect(
      deriveWorkspaceState({
        sessionBannerState: "awaiting-input",
        promptText: "",
        readyPendingItemCount: 0
      })
    ).toBe("awaiting-input");
  });

  it("derives result states from terminal completion states", () => {
    expect(
      deriveWorkspaceState({
        sessionBannerState: "completed",
        promptText: "",
        readyPendingItemCount: 0
      })
    ).toBe("completed");

    expect(
      deriveWorkspaceState({
        sessionBannerState: "failed",
        promptText: "",
        readyPendingItemCount: 0
      })
    ).toBe("failed");

    expect(
      deriveWorkspaceState({
        sessionBannerState: "disconnected",
        promptText: "",
        readyPendingItemCount: 0
      })
    ).toBe("disconnected");
  });

  it("exposes live run and results helpers", () => {
    expect(isLiveRunWorkspaceState("running")).toBe(true);
    expect(isLiveRunWorkspaceState("awaiting-approval")).toBe(true);
    expect(isLiveRunWorkspaceState("completed")).toBe(false);

    expect(isResultsWorkspaceState("completed")).toBe(true);
    expect(isResultsWorkspaceState("failed")).toBe(true);
    expect(isResultsWorkspaceState("idle")).toBe(false);
  });

  it("recommends utility modes from the simplified model", () => {
    expect(
      recommendUtilityMode({
        surface: "project",
        workspaceState: "idle",
        readyPendingItemCount: 0,
        hasTranscriptHistory: false,
        hasLoadedTranscript: false,
        hasRepoChanges: false
      })
    ).toBe("history");

    expect(
      recommendUtilityMode({
        surface: "workspace",
        workspaceState: "ready-to-compose",
        readyPendingItemCount: 1,
        hasTranscriptHistory: false,
        hasLoadedTranscript: false,
        hasRepoChanges: false
      })
    ).toBe("context");

    expect(
      recommendUtilityMode({
        surface: "workspace",
        workspaceState: "running",
        readyPendingItemCount: 0,
        hasTranscriptHistory: false,
        hasLoadedTranscript: false,
        hasRepoChanges: true
      })
    ).toBe("changes");

    expect(
      recommendUtilityMode({
        surface: "workspace",
        workspaceState: "completed",
        readyPendingItemCount: 0,
        hasTranscriptHistory: true,
        hasLoadedTranscript: false,
        hasRepoChanges: false
      })
    ).toBe("transcript");
  });
});
