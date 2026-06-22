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
    expect(fs.existsSync(path.join(response.body.extractedFolderAbsolutePath, "notes.md"))).toBe(true);
    expect(fs.existsSync(path.join(response.body.extractedFolderAbsolutePath, "data", "info.json"))).toBe(true);
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
    };
    expect(metadata.originalFileName).toBe("meta.zip");
    expect(metadata.extractedFileCount).toBe(1);
  });

  it("rejects ZIPs with too many extractable files", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const entries = Array.from({ length: MAX_EXTRACTED_FILE_COUNT + 1 }, (_, index) => ({
      name: `file-${index}.md`,
      content: "x"
    }));
    const zipBuffer = await createZipBuffer(entries);

    const response = await uploadBuffer(repoPath, zipBuffer, "too-many.zip", "application/zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("2,000");
  });

  it("enforces the total extracted size limit", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "one.md", content: "a".repeat(21 * 1024 * 1024) },
      { name: "two.md", content: "b".repeat(21 * 1024 * 1024) },
      { name: "three.md", content: "c".repeat(21 * 1024 * 1024) },
      { name: "four.md", content: "d".repeat(21 * 1024 * 1024) },
      { name: "five.md", content: "e".repeat(21 * 1024 * 1024) }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "too-large-total.zip", "application/zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("100MB");
  });

  it("enforces the single extracted file size limit", async () => {
    const repoPath = makeTempDir("codex-web-zip-");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Example\n", "utf8");
    const zipBuffer = await createZipBuffer([
      { name: "huge.md", content: "a".repeat(MAX_SINGLE_EXTRACTED_FILE_BYTES + 1) }
    ]);

    const response = await uploadBuffer(repoPath, zipBuffer, "too-large-file.zip", "application/zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("25MB");
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
  });
});
