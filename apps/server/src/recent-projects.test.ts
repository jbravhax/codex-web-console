import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRecentProjectsStore } from "./recent-projects.js";

const createdPaths: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdPaths.push(dir);
  return dir;
}

afterEach(() => {
  for (const targetPath of createdPaths.splice(0, createdPaths.length)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
});

describe("recent projects store", () => {
  it("records project opens and increments the open count", () => {
    const root = makeTempDir("codex-web-recent-projects-");
    const repoPath = makeTempDir("codex-web-repo-");
    const store = createRecentProjectsStore(path.join(root, "recent-projects.json"));

    store.recordProjectOpen(repoPath);
    store.recordProjectOpen(repoPath);

    expect(store.listRecentProjects()).toEqual([
      expect.objectContaining({
        repoPath,
        openCount: 2,
        available: true
      })
    ]);
  });

  it("keeps the most recently opened projects first and only stores the latest 10", () => {
    const root = makeTempDir("codex-web-recent-projects-");
    const store = createRecentProjectsStore(path.join(root, "recent-projects.json"));
    const repoPaths = Array.from({ length: 12 }, (_, index) => makeTempDir(`codex-web-repo-${index}-`));

    for (const repoPath of repoPaths) {
      store.recordProjectOpen(repoPath);
    }

    const items = store.listRecentProjects();
    expect(items).toHaveLength(10);
    expect(items[0]?.repoPath).toBe(repoPaths[11]);
    expect(items[9]?.repoPath).toBe(repoPaths[2]);
  });

  it("marks missing recent paths as unavailable", () => {
    const root = makeTempDir("codex-web-recent-projects-");
    const repoPath = makeTempDir("codex-web-repo-");
    const store = createRecentProjectsStore(path.join(root, "recent-projects.json"));

    store.recordProjectOpen(repoPath);
    fs.rmSync(repoPath, { recursive: true, force: true });

    expect(store.listRecentProjects()).toEqual([
      expect.objectContaining({
        repoPath,
        available: false
      })
    ]);
  });
});
