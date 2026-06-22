import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type RecentProjectRecord = {
  repoPath: string;
  lastOpenedAt: string;
  openCount: number;
};

export type RecentProjectListItem = RecentProjectRecord & {
  available: boolean;
};

const CONFIG_DIR = path.join(os.homedir(), ".codex-web-console");
const RECENT_PROJECTS_PATH = path.join(CONFIG_DIR, "recent-projects.json");
const MAX_RECENT_PROJECTS = 10;

function ensureConfigDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sortRecentProjects(items: RecentProjectRecord[]): RecentProjectRecord[] {
  return [...items].sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime());
}

export function createRecentProjectsStore(filePath = RECENT_PROJECTS_PATH) {
  function readRecords(): RecentProjectRecord[] {
    ensureConfigDir(filePath);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as RecentProjectRecord[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(
        (item) =>
          item &&
          typeof item.repoPath === "string" &&
          typeof item.lastOpenedAt === "string" &&
          typeof item.openCount === "number"
      );
    } catch {
      return [];
    }
  }

  function writeRecords(items: RecentProjectRecord[]): void {
    ensureConfigDir(filePath);
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(sortRecentProjects(items).slice(0, MAX_RECENT_PROJECTS), null, 2)}\n`,
      "utf8"
    );
  }

  return {
    recordProjectOpen(repoPath: string): RecentProjectRecord {
      const records = readRecords();
      const now = new Date().toISOString();
      const existing = records.find((item) => item.repoPath === repoPath);

      const nextRecords = existing
        ? records.map((item) =>
            item.repoPath === repoPath
              ? {
                  ...item,
                  lastOpenedAt: now,
                  openCount: item.openCount + 1
                }
              : item
          )
        : [{ repoPath, lastOpenedAt: now, openCount: 1 }, ...records];

      writeRecords(nextRecords);
      return sortRecentProjects(nextRecords)[0];
    },

    listRecentProjects(): RecentProjectListItem[] {
      return sortRecentProjects(readRecords())
        .slice(0, MAX_RECENT_PROJECTS)
        .map((item) => ({
          ...item,
          available: fs.existsSync(item.repoPath) && fs.statSync(item.repoPath).isDirectory()
        }));
    }
  };
}
