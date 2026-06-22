import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, createServices } from "./app.js";
import type { AppConfig } from "./config.js";
import { createProject } from "./projects.js";

const createdPaths: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdPaths.push(dir);
  return dir;
}

function makeConfig(): AppConfig {
  return {
    codexExecutablePath: "codex",
    defaultRepoRoot: os.homedir(),
    serverBindHost: "127.0.0.1",
    serverPort: 8787,
    theme: "dark"
  };
}

afterEach(() => {
  for (const targetPath of createdPaths.splice(0, createdPaths.length)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
});

describe("createProject", () => {
  it("creates a valid new folder and optional project files", () => {
    const parentPath = makeTempDir("codex-web-project-parent-");
    const repoPath = path.join(parentPath, "new-project");

    const result = createProject(
      {
        repoPath,
        createFolder: true,
        initializeGit: true,
        createReadme: true
      },
      {
        runGitInit: () =>
          ({
            status: 0,
            stderr: "",
            stdout: "Initialized empty Git repository"
          }) as never
      }
    );

    expect(result).toMatchObject({
      repoPath,
      createdFolder: true,
      initializedGit: true,
      createdReadme: true
    });
    expect(fs.existsSync(repoPath)).toBe(true);
    expect(fs.readFileSync(path.join(repoPath, "README.md"), "utf8")).toContain("# New Project");
  });

  it("surfaces git init failures clearly", () => {
    const parentPath = makeTempDir("codex-web-git-failure-parent-");
    const repoPath = path.join(parentPath, "broken-project");

    expect(() =>
      createProject(
        {
          repoPath,
          createFolder: true,
          initializeGit: true,
          createReadme: false
        },
        {
          runGitInit: () =>
            ({
              status: 1,
              stderr: "fatal: git init failed",
              stdout: ""
            }) as never
        }
      )
    ).toThrow("Git initialization failed");

    expect(fs.existsSync(repoPath)).toBe(true);
  });
});

describe("POST /api/projects", () => {
  it("creates a valid new folder through the endpoint", async () => {
    const parentPath = makeTempDir("codex-web-project-endpoint-parent-");
    const repoPath = path.join(parentPath, "new-project");
    const app = createApp(createServices(makeConfig()));

    const response = await request(app).post("/api/projects").send({
      repoPath,
      createFolder: true,
      initializeGit: false,
      createReadme: true
    });

    expect(response.status).toBe(200);
    expect(response.body.repoPath).toBe(repoPath);
    expect(response.body.createdFolder).toBe(true);
    expect(response.body.initializedGit).toBe(false);
    expect(response.body.createdReadme).toBe(true);
  });

  it("rejects existing non-empty folders", async () => {
    const repoPath = makeTempDir("codex-web-existing-project-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Existing\n", "utf8");
    const app = createApp(createServices(makeConfig()));

    const response = await request(app).post("/api/projects").send({
      repoPath,
      createFolder: true,
      initializeGit: false,
      createReadme: false
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("already exists and is not empty");
  });

  it("rejects unsafe target paths", async () => {
    const app = createApp(createServices(makeConfig()));

    const response = await request(app).post("/api/projects").send({
      repoPath: "/etc/new-project",
      createFolder: true,
      initializeGit: false,
      createReadme: false
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Refusing to create a project");
  });
});
