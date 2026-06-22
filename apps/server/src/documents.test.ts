import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, createServices } from "./app.js";
import { MAX_PASTE_BYTES, savePastedDocument } from "./documents.js";
import type { AppConfig } from "./config.js";

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

describe("savePastedDocument", () => {
  it("saves a markdown document and adds .codex-web to gitignore", () => {
    const repoPath = makeTempDir("codex-web-repo-");
    fs.mkdirSync(path.join(repoPath, ".git"));

    const result = savePastedDocument(repoPath, "hello large context");

    expect(result.relativePath.startsWith(".codex-web/documents/pasted-")).toBe(true);
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.readFileSync(path.join(repoPath, ".gitignore"), "utf8")).toContain(".codex-web/");
    expect(fs.readFileSync(result.filePath, "utf8")).toContain("Original character count");
  });

  it("rejects content larger than 1MB", () => {
    const repoPath = makeTempDir("codex-web-repo-");
    fs.mkdirSync(path.join(repoPath, ".git"));

    expect(() => savePastedDocument(repoPath, "a".repeat(MAX_PASTE_BYTES + 1))).toThrow(
      "Pasted content is too large. The current limit is 1MB."
    );
  });
});

describe("POST /api/documents", () => {
  it("saves a pasted document through the endpoint", async () => {
    const repoPath = makeTempDir("codex-web-endpoint-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const app = createApp(createServices(makeConfig()));

    const response = await request(app).post("/api/documents").send({
      repoPath,
      content: "saved from endpoint"
    });

    expect(response.status).toBe(200);
    expect(response.body.relativePath).toMatch(/^\.codex-web\/documents\/pasted-/);
    expect(fs.existsSync(response.body.filePath)).toBe(true);
  });

  it("rejects invalid repo paths", async () => {
    const repoPath = makeTempDir("codex-web-invalid-");
    fs.writeFileSync(path.join(repoPath, "notes.txt"), "hello\n", "utf8");
    const app = createApp(createServices(makeConfig()));

    const response = await request(app).post("/api/documents").send({
      repoPath,
      content: "saved from endpoint"
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("does not look like a project");
  });

  it("rejects oversize documents", async () => {
    const repoPath = makeTempDir("codex-web-oversize-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const app = createApp(createServices(makeConfig()));

    const response = await request(app).post("/api/documents").send({
      repoPath,
      content: "a".repeat(MAX_PASTE_BYTES + 1)
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("1MB");
  });
});
