import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEX_SESSION_INDEX_PATH = path.join(os.homedir(), ".codex", "session_index.jsonl");
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CodexSessionIndexEntry = {
  id: string;
  threadName?: string;
  updatedAt?: string;
};

export function isCodexSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value.trim());
}

export function listCodexSessions(): CodexSessionIndexEntry[] {
  if (!fs.existsSync(CODEX_SESSION_INDEX_PATH)) {
    return [];
  }

  const rawIndex = fs.readFileSync(CODEX_SESSION_INDEX_PATH, "utf8");
  return rawIndex
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as {
          id?: unknown;
          thread_name?: unknown;
          updated_at?: unknown;
        };

        if (typeof parsed.id !== "string" || !isCodexSessionId(parsed.id)) {
          return [];
        }

        return [
          {
            id: parsed.id,
            threadName: typeof parsed.thread_name === "string" ? parsed.thread_name : undefined,
            updatedAt: typeof parsed.updated_at === "string" ? parsed.updated_at : undefined
          }
        ];
      } catch {
        return [];
      }
    });
}

export function findCodexSession(sessionId: string): CodexSessionIndexEntry | null {
  const normalizedSessionId = sessionId.trim();
  if (!isCodexSessionId(normalizedSessionId)) {
    return null;
  }

  return listCodexSessions().find((entry) => entry.id === normalizedSessionId) ?? null;
}
