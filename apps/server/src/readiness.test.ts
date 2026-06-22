import { describe, expect, it } from "vitest";
import { runEnvironmentReadinessChecks } from "./readiness.js";
import type { AppConfig } from "./config.js";

const TEST_CONFIG: AppConfig = {
  codexExecutablePath: "codex",
  defaultRepoRoot: "/workspace",
  serverBindHost: "127.0.0.1",
  serverPort: 8787,
  theme: "dark"
};

describe("runEnvironmentReadinessChecks", () => {
  it("passes when executables, project path, access, and Linux sandbox checks look healthy", () => {
    const readiness = runEnvironmentReadinessChecks(TEST_CONFIG, "/workspace/project", {
      platform: "linux",
      pathEnv: "/usr/local/bin:/usr/bin",
      validateRepoPath: (inputPath) => inputPath,
      accessSync: (targetPath, mode) => {
        if (targetPath === "/usr/local/bin/codex" || targetPath === "/usr/local/bin/git" || targetPath === "/usr/local/bin/bwrap") {
          return;
        }

        if (targetPath === "/workspace/project") {
          return;
        }

        throw new Error(`unexpected access check for ${targetPath} (${mode ?? 0})`);
      },
      existsSync: () => true,
      readFileSync: (targetPath) => {
        if (targetPath === "/proc/sys/kernel/unprivileged_userns_clone") {
          return "1\n";
        }

        if (targetPath === "/proc/sys/user/max_user_namespaces") {
          return "1024\n";
        }

        throw new Error(`unexpected read for ${targetPath}`);
      }
    });

    expect(readiness.overallStatus).toBe("passed");
    expect(readiness.canStart).toBe(true);
    expect(readiness.items.every((item) => item.status === "passed")).toBe(true);
  });

  it("fails when codex is missing or the project folder is invalid", () => {
    const readiness = runEnvironmentReadinessChecks(TEST_CONFIG, "/workspace/Projects", {
      platform: "linux",
      pathEnv: "/usr/local/bin:/usr/bin",
      validateRepoPath: () => {
        throw new Error(
          "That folder looks like a broad parent directory that contains multiple projects. Open one specific project folder inside it instead."
        );
      },
      accessSync: (targetPath) => {
        if (targetPath === "/usr/local/bin/git" || targetPath === "/usr/local/bin/bwrap") {
          return;
        }

        throw new Error(`missing or inaccessible: ${targetPath}`);
      },
      existsSync: () => true,
      readFileSync: (targetPath) => {
        if (targetPath === "/proc/sys/kernel/unprivileged_userns_clone") {
          return "1\n";
        }

        if (targetPath === "/proc/sys/user/max_user_namespaces") {
          return "1024\n";
        }

        throw new Error(`unexpected read for ${targetPath}`);
      }
    });

    expect(readiness.overallStatus).toBe("failed");
    expect(readiness.canStart).toBe(false);
    expect(readiness.items.find((item) => item.key === "codex-executable")?.status).toBe("failed");
    expect(readiness.items.find((item) => item.key === "project-folder")?.message).toContain("broad parent directory");
  });

  it("warns when git is missing or Linux namespace readiness cannot be fully verified", () => {
    const readiness = runEnvironmentReadinessChecks(TEST_CONFIG, "/workspace/project", {
      platform: "linux",
      pathEnv: "/usr/local/bin:/usr/bin",
      validateRepoPath: (inputPath) => inputPath,
      accessSync: (targetPath) => {
        if (targetPath === "/usr/local/bin/codex" || targetPath === "/usr/local/bin/bwrap" || targetPath === "/workspace/project") {
          return;
        }

        throw new Error(`missing or inaccessible: ${targetPath}`);
      },
      existsSync: () => true,
      readFileSync: () => {
        throw new Error("not readable");
      }
    });

    expect(readiness.overallStatus).toBe("warning");
    expect(readiness.canStart).toBe(true);
    expect(readiness.items.find((item) => item.key === "git-executable")?.status).toBe("warning");
    expect(readiness.items.find((item) => item.key === "user-namespaces")?.status).toBe("warning");
  });

  it("fails Linux sandbox readiness when bubblewrap or user namespaces are clearly unavailable", () => {
    const readiness = runEnvironmentReadinessChecks(TEST_CONFIG, "/workspace/project", {
      platform: "linux",
      pathEnv: "/usr/local/bin:/usr/bin",
      validateRepoPath: (inputPath) => inputPath,
      accessSync: (targetPath) => {
        if (targetPath === "/usr/local/bin/codex" || targetPath === "/usr/local/bin/git" || targetPath === "/workspace/project") {
          return;
        }

        throw new Error(`missing or inaccessible: ${targetPath}`);
      },
      existsSync: () => true,
      readFileSync: (targetPath) => {
        if (targetPath === "/proc/sys/kernel/unprivileged_userns_clone") {
          return "0\n";
        }

        if (targetPath === "/proc/sys/user/max_user_namespaces") {
          return "0\n";
        }

        throw new Error(`unexpected read for ${targetPath}`);
      }
    });

    expect(readiness.overallStatus).toBe("failed");
    expect(readiness.canStart).toBe(false);
    expect(readiness.items.find((item) => item.key === "bubblewrap")?.status).toBe("failed");
    expect(readiness.items.find((item) => item.key === "user-namespaces")?.status).toBe("failed");
  });
});
