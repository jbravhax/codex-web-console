import type { ReadinessSummary } from "./app-types";

export async function loadReadiness(
  repoPath: string,
  fetchImpl: typeof fetch = fetch
): Promise<ReadinessSummary> {
  const response = await fetchImpl(`/api/readiness?repoPath=${encodeURIComponent(repoPath)}`);
  const payload = (await response.json()) as ReadinessSummary | { error?: string };

  if (!response.ok || ("error" in payload && typeof payload.error === "string")) {
    throw new Error("error" in payload && payload.error ? payload.error : "Could not run environment checks.");
  }

  return payload as ReadinessSummary;
}
