import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyProjectDirectory,
  validateInspectableDirectoryPath,
  validateNewProjectPath,
  validateRepoPath
} from "./repo-paths.js";

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
  it("classifies a Git repository using .git markers", () => {
    const repoPath = makeTempDir("codex-web-git-profile-");
    fs.mkdirSync(path.join(repoPath, ".git"));
    fs.writeFileSync(path.join(repoPath, "package.json"), "{}\n", "utf8");

    expect(classifyProjectDirectory(repoPath)).toMatchObject({
      kind: "git-repository",
      isGitRepository: true
    });
  });

  it("classifies a source project folder using common project markers", () => {
    const repoPath = makeTempDir("codex-web-source-profile-");
    fs.writeFileSync(path.join(repoPath, "go.mod"), "module example.com/app\n", "utf8");

    expect(classifyProjectDirectory(repoPath)).toMatchObject({
      kind: "source-project",
      markers: ["go.mod"]
    });
  });

  it("classifies an empty folder separately from a generic directory", () => {
    const repoPath = makeTempDir("codex-web-empty-profile-");

    expect(classifyProjectDirectory(repoPath)).toMatchObject({
      kind: "empty-folder",
      isEmpty: true
    });
  });

  it("classifies a broad parent folder that contains child projects", () => {
    const directoryPath = makeTempDir("codex-web-parent-profile-");
    const apiService = path.join(directoryPath, "api-service");
    const workerService = path.join(directoryPath, "worker-service");
    fs.mkdirSync(apiService);
    fs.mkdirSync(workerService);
    fs.writeFileSync(path.join(apiService, "package-lock.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(workerService, "pyproject.toml"), "[project]\nname='worker'\n", "utf8");

    expect(classifyProjectDirectory(directoryPath)).toMatchObject({
      kind: "broad-parent-folder",
      childProjectCount: 2
    });
  });

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
    fs.writeFileSync(path.join(directoryPath, "notes.txt"), "hello\n", "utf8");

    expect(() => validateRepoPath(directoryPath)).toThrow("does not look like a project");
  });

  it("rejects empty folders for repo startup with create-project guidance", () => {
    const directoryPath = makeTempDir("codex-web-empty-start-");

    expect(() => validateRepoPath(directoryPath)).toThrow("That folder is empty");
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

  it("accepts a new project path when the parent folder exists", () => {
    const parentPath = makeTempDir("codex-web-new-parent-");
    const repoPath = path.join(parentPath, "new-project");

    expect(validateNewProjectPath(repoPath)).toBe(repoPath);
  });

  it("rejects existing non-empty folders for new project creation", () => {
    const repoPath = makeTempDir("codex-web-existing-project-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Existing\n", "utf8");

    expect(() => validateNewProjectPath(repoPath)).toThrow("already exists and is not empty");
  });

  it("rejects unsafe new project paths", () => {
    expect(() => validateNewProjectPath("/etc/new-project")).toThrow("Refusing to create a project");
  });
});
