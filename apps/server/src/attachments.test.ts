import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import yazl from "yazl";
import { createApp, createServices } from "./app.js";
import {
  ensureSafeZipEntryName,
  MAX_ATTACHMENT_BYTES,
  MAX_EXTRACTED_FILE_COUNT,
  MAX_SINGLE_EXTRACTED_FILE_BYTES,
  MAX_TOTAL_EXTRACTED_BYTES,
  sanitizeFileName
} from "./attachments.js";
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

function createZipBuffer(
  entries: Array<{
    name: string;
    content?: string | Buffer;
    mode?: number;
  }>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zipFile = new yazl.ZipFile();
    for (const entry of entries) {
      if (entry.name.endsWith("/")) {
        zipFile.addEmptyDirectory(entry.name, { mode: entry.mode });
      } else {
        zipFile.addBuffer(Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content ?? ""), entry.name, {
          mode: entry.mode
        });
      }
    }

    const chunks: Buffer[] = [];
    zipFile.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zipFile.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zipFile.outputStream.on("error", reject);
    zipFile.end();
  });
}

function createRepeatedEntries(
  count: number,
  fileNameFactory: (index: number) => string,
  contentFactory: (index: number) => string | Buffer = () => "x"
) {
  return Array.from({ length: count }, (_, index) => ({
    name: fileNameFactory(index),
    content: contentFactory(index)
  }));
}

function createFilledBuffer(sizeBytes: number, byte = 0x61): Buffer {
  return Buffer.alloc(sizeBytes, byte);
}

async function uploadBuffer(
  repoPath: string,
  buffer: Buffer,
  fileName: string,
  contentType = "application/octet-stream"
) {
  const app = createApp(createServices(makeConfig()));

  return request(app)
    .post("/api/attachments")
    .field("repoPath", repoPath)
    .attach("file", buffer, { filename: fileName, contentType });
}

afterEach(() => {
  for (const targetPath of createdPaths.splice(0, createdPaths.length)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
});

describe("POST /api/attachments", () => {
  it("uploads a supported attachment successfully", async () => {
    const repoPath = makeTempDir("codex-web-attachment-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");

    const response = await uploadBuffer(repoPath, Buffer.from("hello"), "notes.md", "text/markdown");

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe("file");
    expect(response.body.fileName).toBe("notes.md");
    expect(response.body.relativePath).toBe(".codex-web/attachments/files/notes.md");
    expect(fs.existsSync(response.body.absolutePath)).toBe(true);
  });

  it("rejects unsupported file types", async () => {
    const repoPath = makeTempDir("codex-web-attachment-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");

    const response = await uploadBuffer(repoPath, Buffer.from("hello"), "notes.exe");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unsupported file type");
  });

  it("rejects attachments larger than 10MB", async () => {
    const repoPath = makeTempDir("codex-web-attachment-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");

    const response = await uploadBuffer(repoPath, Buffer.from("a".repeat(MAX_ATTACHMENT_BYTES + 1)), "large.md");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("10MB");
  });

  it("sanitizes uploaded filenames", async () => {
    const repoPath = makeTempDir("codex-web-attachment-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");

    const response = await uploadBuffer(repoPath, Buffer.from("hello"), "my notes?.md", "text/markdown");

    expect(response.status).toBe(200);
    expect(response.body.fileName).toBe("my-notes-.md");
  });

  it("prevents path traversal through the uploaded filename", async () => {
    const repoPath = makeTempDir("codex-web-attachment-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");

    const response = await uploadBuffer(repoPath, Buffer.from("hello"), "../escape.md", "text/markdown");

    expect(response.status).toBe(200);
    expect(response.body.fileName).toBe("escape.md");
    expect(response.body.absolutePath.startsWith(path.join(repoPath, ".codex-web", "attachments", "files"))).toBe(
      true
    );
  });
});

describe("ZIP attachments", () => {
  it("uploads and extracts a normal ZIP", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "notes.md", content: "# Notes" },
      { name: "data/info.json", content: '{"ok":true}' }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "bundle.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe("zip");
    expect(response.body.relativePath).toBe(".codex-web/attachments/zips/bundle.zip");
    expect(response.body.extractedFolderRelativePath).toContain(".codex-web/attachments/extracted/");
    expect(response.body.extractedFileCount).toBe(2);
    expect(response.body.extractedFiles).toEqual(["notes.md", "data/info.json"]);
    expect(response.body.treePreview).toContain("- notes.md");
    expect(fs.existsSync(path.join(response.body.extractedFolderAbsolutePath, "notes.md"))).toBe(true);
    expect(fs.existsSync(path.join(response.body.extractedFolderAbsolutePath, "data", "info.json"))).toBe(true);
  });

  it("extracts a typical JavaScript repository ZIP", async () => {
    const repoPath = makeTempDir("codex-web-js-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "package.json", content: '{"name":"demo"}' },
      { name: "src/index.ts", content: "export const ok = true;" },
      { name: "src/App.tsx", content: "export function App() { return null; }" },
      { name: "pnpm-lock.yaml", content: "lockfileVersion: 9" }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "js-repo.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.extractedFileCount).toBe(4);
    expect(response.body.extractedFiles).toContain("package.json");
    expect(response.body.extractedFiles).toContain("src/index.ts");
    expect(response.body.extractedFiles).toContain("src/App.tsx");
    expect(response.body.extractedFiles).toContain("pnpm-lock.yaml");
  });

  it("extracts a typical Python project ZIP", async () => {
    const repoPath = makeTempDir("codex-web-py-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "pyproject.toml", content: "[project]\nname='demo'" },
      { name: "requirements.txt", content: "fastapi\nuvicorn" },
      { name: "app/main.py", content: "print('ok')" }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "python-repo.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.extractedFileCount).toBe(3);
    expect(response.body.extractedFiles).toContain("pyproject.toml");
    expect(response.body.extractedFiles).toContain("requirements.txt");
    expect(response.body.extractedFiles).toContain("app/main.py");
  });

  it("extracts a mixed-language repository ZIP with project files", async () => {
    const repoPath = makeTempDir("codex-web-mixed-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "src/service.go", content: "package main" },
      { name: "scripts/build.ps1", content: "Write-Host ok" },
      { name: "backend/Program.cs", content: "class Program {}" },
      { name: "backend/demo.csproj", content: "<Project />" },
      { name: "Dockerfile", content: "FROM node:20" }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "mixed.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.extractedFileCount).toBe(5);
    expect(response.body.extractedFiles).toContain("backend/demo.csproj");
    expect(response.body.extractedFiles).toContain("Dockerfile");
  });

  it("extracts a medium-sized source repository with nested folders and repo metadata", async () => {
    const repoPath = makeTempDir("codex-web-medium-repo-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");

    const entries = [
      { name: "package.json", content: '{"name":"medium-demo"}' },
      { name: "pnpm-lock.yaml", content: "lockfileVersion: 9" },
      { name: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}' },
      { name: "README.md", content: "# Medium Demo" },
      { name: "src/index.ts", content: "export * from './server';" },
      { name: "src/server/app.ts", content: "export const app = true;" },
      { name: "src/server/routes/health.ts", content: "export const health = '/health';" },
      { name: "src/lib/logger.ts", content: "export const logger = console;" },
      { name: "config/default.yaml", content: "port: 3000" },
      { name: "scripts/build.ps1", content: "Write-Host build" },
      ...createRepeatedEntries(60, (index) => `src/features/feature-${index}.ts`, (index) => `export const feature${index} = ${index};`)
    ];

    const zipBuffer = await createZipBuffer(entries);

    const response = await uploadBuffer(repoPath, zipBuffer, "medium-repo.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.extractedFileCount).toBe(entries.length);
    expect(response.body.treePreview).toContain("- package.json");
    expect(response.body.extractedFiles).toContain("src/server/routes/health.ts");
    const metadata = JSON.parse(fs.readFileSync(response.body.metadataAbsolutePath, "utf8")) as {
      extractedFileCount: number;
      skippedFileCount: number;
      limitsApplied: { maxExtractedFileCount: number };
    };
    expect(metadata.extractedFileCount).toBe(entries.length);
    expect(metadata.skippedFileCount).toBe(0);
    expect(metadata.limitsApplied.maxExtractedFileCount).toBe(MAX_EXTRACTED_FILE_COUNT);
  });

  it("supports nested folders inside ZIPs", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([{ name: "nested/deeper/logs/app.log", content: "line one" }]);

    const response = await uploadBuffer(repoPath, zipBuffer, "nested.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(fs.existsSync(path.join(response.body.extractedFolderAbsolutePath, "nested", "deeper", "logs", "app.log"))).toBe(
      true
    );
  });

  it("skips unsupported files without failing the ZIP upload", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "notes.md", content: "# Notes" },
      { name: "bin/run.exe", content: "bad" }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "mixed.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.extractedFileCount).toBe(1);
    expect(response.body.skippedFileCount).toBe(1);
    expect(response.body.skippedFiles).toContain("bin/run.exe");
    expect(response.body.skippedReasonCounts["unsupported-type"]).toBe(1);
  });

  it("extracts reviewable source files while clearly skipping unsupported binary content", async () => {
    const repoPath = makeTempDir("codex-web-mixed-binary-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "README.md", content: "# Repo" },
      { name: "src/main.rs", content: "fn main() {}" },
      { name: "assets/logo.svg", content: "<svg />" },
      { name: "bin/tool.exe", content: createFilledBuffer(256, 0x42) },
      { name: "dist/app.bin", content: createFilledBuffer(512, 0x7f) }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "mixed-binary.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.extractedFiles).toEqual(expect.arrayContaining(["README.md", "src/main.rs"]));
    expect(response.body.skippedFiles).toEqual(expect.arrayContaining(["assets/logo.svg", "bin/tool.exe", "dist/app.bin"]));
    expect(response.body.skippedReasonCounts["unsupported-type"]).toBe(3);
  });

  it("creates extraction metadata", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([{ name: "notes.md", content: "# Notes" }]);

    const response = await uploadBuffer(repoPath, zipBuffer, "meta.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(fs.existsSync(response.body.metadataAbsolutePath)).toBe(true);
    const metadata = JSON.parse(fs.readFileSync(response.body.metadataAbsolutePath, "utf8")) as {
      originalFileName: string;
      extractedFileCount: number;
      treePreview: string[];
      skippedReasonCounts: Record<string, number>;
    };
    expect(metadata.originalFileName).toBe("meta.zip");
    expect(metadata.extractedFileCount).toBe(1);
    expect(metadata.treePreview).toContain("- notes.md");
    expect(metadata.skippedReasonCounts).toEqual({});
  });

  it("includes lock files and config files used for repository analysis", async () => {
    const repoPath = makeTempDir("codex-web-lock-config-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "package-lock.json", content: '{"lockfileVersion":3}' },
      { name: "Cargo.toml", content: "[package]\nname='demo'" },
      { name: "build.gradle.kts", content: "plugins {}" },
      { name: "config/app.properties", content: "mode=dev" }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "config.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.extractedFiles).toEqual(
      expect.arrayContaining(["package-lock.json", "Cargo.toml", "build.gradle.kts", "config/app.properties"])
    );
  });

  it("records extraction metadata for skipped unsupported files", async () => {
    const repoPath = makeTempDir("codex-web-zip-metadata-skips-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "README.md", content: "# Repo" },
      { name: "bin/tool.exe", content: createFilledBuffer(64, 0x01) }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "metadata-skips.zip", "application/zip");

    expect(response.status).toBe(200);
    const metadata = JSON.parse(fs.readFileSync(response.body.metadataAbsolutePath, "utf8")) as {
      skippedFiles: string[];
      skippedReasonCounts: Record<string, number>;
      limitsApplied: { maxTotalExtractedBytes: number };
    };
    expect(metadata.skippedFiles).toContain("bin/tool.exe");
    expect(metadata.skippedReasonCounts["unsupported-type"]).toBe(1);
    expect(metadata.limitsApplied.maxTotalExtractedBytes).toBe(MAX_TOTAL_EXTRACTED_BYTES);
  });

  it("rejects ZIPs with too many extractable files", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const entries = createRepeatedEntries(MAX_EXTRACTED_FILE_COUNT + 1, (index) => `file-${index}.md`);
    const zipBuffer = await createZipBuffer(entries);

    const response = await uploadBuffer(repoPath, zipBuffer, "too-many.zip", "application/zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("2,000");
  }, 15000);

  it("enforces the total extracted size limit", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "one.md", content: createFilledBuffer(21 * 1024 * 1024, 0x61) },
      { name: "two.md", content: createFilledBuffer(21 * 1024 * 1024, 0x62) },
      { name: "three.md", content: createFilledBuffer(21 * 1024 * 1024, 0x63) },
      { name: "four.md", content: createFilledBuffer(21 * 1024 * 1024, 0x64) },
      { name: "five.md", content: createFilledBuffer(21 * 1024 * 1024, 0x65) }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "too-large-total.zip", "application/zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("100MB");
  });

  it("enforces the single extracted file size limit", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "huge.md", content: createFilledBuffer(MAX_SINGLE_EXTRACTED_FILE_BYTES + 1, 0x61) }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "too-large-file.zip", "application/zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("25MB");
  });

  it("rejects ZIPs containing symlink entries", async () => {
    const repoPath = makeTempDir("codex-web-zip-symlink-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([{ name: "link.sh", content: "README.md", mode: 0o120777 }]);

    const response = await uploadBuffer(repoPath, zipBuffer, "symlink.zip", "application/zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("symlink");
  });

  it("rejects invalid ZIP archives with a clearer message", async () => {
    const repoPath = makeTempDir("codex-web-invalid-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");

    const response = await uploadBuffer(repoPath, Buffer.from("not a real zip archive"), "broken.zip", "application/zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("valid .zip file");
  });

  it("handles a large but legitimate source repository ZIP within limits", async () => {
    const repoPath = makeTempDir("codex-web-large-legit-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const entries = createRepeatedEntries(
      180,
      (index) => `src/module-${index}.ts`,
      (index) => `export const value${index} = ${index};`
    );
    const zipBuffer = await createZipBuffer(entries);

    const response = await uploadBuffer(repoPath, zipBuffer, "large-legit.zip", "application/zip");

    expect(response.status).toBe(200);
    expect(response.body.extractedFileCount).toBe(180);
    expect(response.body.treePreview[0]).toContain("module-0.ts");
  });
});

describe("sanitizeFileName", () => {
  it("strips dangerous path characters", () => {
    expect(sanitizeFileName("../bad\\name?.md")).toBe("name-.md");
  });
});

describe("ensureSafeZipEntryName", () => {
  it("rejects absolute path entries", () => {
    expect(() => ensureSafeZipEntryName("/etc/passwd")).toThrow("absolute path");
    expect(() => ensureSafeZipEntryName("C:/Windows/System32/drivers/etc/hosts")).toThrow("absolute path");
  });

  it("rejects path traversal entries", () => {
    expect(() => ensureSafeZipEntryName("../escape.md")).toThrow("path traversal");
    expect(() => ensureSafeZipEntryName("nested/../../escape.md")).toThrow("path traversal");
    expect(() => ensureSafeZipEntryName("nested\\..\\..\\escape.md")).toThrow("path traversal");
  });
});
