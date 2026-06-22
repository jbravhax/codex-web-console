import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureCodexWebGitignoreEntry } from "./storage.js";

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

describe("ensureCodexWebGitignoreEntry", () => {
  it("adds .codex-web to a new gitignore file", () => {
    const repoPath = makeTempDir("codex-web-gitignore-");

    ensureCodexWebGitignoreEntry(repoPath);

    expect(fs.readFileSync(path.join(repoPath, ".gitignore"), "utf8")).toBe(".codex-web/\n");
  });

  it("does not duplicate the .codex-web gitignore entry", () => {
    const repoPath = makeTempDir("codex-web-gitignore-");
    fs.writeFileSync(path.join(repoPath, ".gitignore"), ".codex-web/\nnode_modules/\n", "utf8");

    ensureCodexWebGitignoreEntry(repoPath);

    expect(fs.readFileSync(path.join(repoPath, ".gitignore"), "utf8")).toBe(".codex-web/\nnode_modules/\n");
  });
});
