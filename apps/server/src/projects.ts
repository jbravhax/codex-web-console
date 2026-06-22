import * as childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { validateNewProjectPath } from "./repo-paths.js";

export type CreateProjectRequest = {
  repoPath: string;
  createFolder: boolean;
  initializeGit: boolean;
  createReadme: boolean;
};

export type CreateProjectResult = {
  repoPath: string;
  createdFolder: boolean;
  initializedGit: boolean;
  createdReadme: boolean;
  message: string;
};

type CreateProjectDependencies = {
  runGitInit?(repoPath: string): childProcess.SpawnSyncReturns<string>;
};

function buildProjectCreatedMessage(result: CreateProjectResult): string {
  const completedSteps: string[] = [];

  if (result.createdFolder) {
    completedSteps.push("created the folder");
  }

  if (result.initializedGit) {
    completedSteps.push("initialized Git");
  }

  if (result.createdReadme) {
    completedSteps.push("added README.md");
  }

  if (completedSteps.length === 0) {
    return `Project folder is ready at ${result.repoPath}.`;
  }

  return `Project created at ${result.repoPath}: ${completedSteps.join(", ")}.`;
}

export function runGitInit(repoPath: string): childProcess.SpawnSyncReturns<string> {
  return childProcess.spawnSync("git", ["init"], {
    cwd: repoPath,
    encoding: "utf8"
  });
}

export function createProject(request: CreateProjectRequest, dependencies: CreateProjectDependencies = {}): CreateProjectResult {
  const repoPath = validateNewProjectPath(request.repoPath);
  const projectExists = fs.existsSync(repoPath);
  let createdFolder = false;
  let initializedGit = false;
  let createdReadme = false;

  if (!projectExists) {
    if (!request.createFolder) {
      throw new Error("Turn on Create folder to make a new project at this path.");
    }

    fs.mkdirSync(repoPath, { recursive: true });
    createdFolder = true;
  }

  if (request.initializeGit) {
    const gitInitResult = (dependencies.runGitInit ?? runGitInit)(repoPath);

    if (gitInitResult.error) {
      throw new Error(
        `Created the folder, but Git initialization failed. ${gitInitResult.error.message || "Make sure git is installed and try again."}`
      );
    }

    if (gitInitResult.status !== 0) {
      const stderr = gitInitResult.stderr?.trim();
      throw new Error(
        `Created the folder, but Git initialization failed. ${stderr || "Git returned a non-zero exit code."}`
      );
    }

    initializedGit = true;
  }

  if (request.createReadme) {
    fs.writeFileSync(path.join(repoPath, "README.md"), "# New Project\n", "utf8");
    createdReadme = true;
  }

  const result: CreateProjectResult = {
    repoPath,
    createdFolder,
    initializedGit,
    createdReadme,
    message: ""
  };
  result.message = buildProjectCreatedMessage(result);
  return result;
}
