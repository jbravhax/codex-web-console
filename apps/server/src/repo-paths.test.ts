import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateInspectableDirectoryPath, validateRepoPath } from "./repo-paths.js";

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

describe("repo path validation", () => {
  it("accepts a project directory with a project hint", () => {
    const repoPath = makeTempDir("codex-web-repo-path-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");

    expect(validateRepoPath(repoPath)).toBe(repoPath);
  });

  it("allows inspectable non-project directories for read-only checks", () => {
    const directoryPath = makeTempDir("codex-web-inspectable-");

    expect(validateInspectableDirectoryPath(directoryPath)).toBe(directoryPath);
  });

  it("rejects missing project hints for repo startup", () => {
    const directoryPath = makeTempDir("codex-web-no-hint-");

    expect(() => validateRepoPath(directoryPath)).toThrow("does not look like a project");
  });

  it("rejects broad parent folders that contain multiple projects", () => {
    const directoryPath = makeTempDir("codex-web-parent-");
    const appOne = path.join(directoryPath, "app-one");
    const appTwo = path.join(directoryPath, "app-two");
    fs.mkdirSync(appOne);
    fs.mkdirSync(appTwo);
    fs.writeFileSync(path.join(appOne, "README.md"), "# App One\n", "utf8");
    fs.writeFileSync(path.join(appTwo, "package.json"), "{}\n", "utf8");

    expect(() => validateRepoPath(directoryPath)).toThrow("broad parent directory");
  });

  it("rejects file paths", () => {
    const repoPath = makeTempDir("codex-web-file-path-");
    const filePath = path.join(repoPath, "README.md");
    fs.writeFileSync(filePath, "# Example\n", "utf8");

    expect(() => validateRepoPath(filePath)).toThrow("not a directory");
  });

  it("rejects dangerous absolute paths", () => {
    expect(() => validateInspectableDirectoryPath("/")).toThrow("Refusing to start Codex");
    expect(() => validateInspectableDirectoryPath("/etc")).toThrow("Refusing to start Codex");
  });

  it("rejects /home without a subdirectory", () => {
    expect(() => validateInspectableDirectoryPath("/home")).toThrow("specific folder inside /home");
  });
});
