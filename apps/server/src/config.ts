import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ThemeSetting = "light" | "dark";

export type AppConfig = {
  codexExecutablePath: string;
  defaultRepoRoot: string;
  serverBindHost: string;
  serverPort: number;
  theme: ThemeSetting;
};

const CONFIG_DIR = path.join(os.homedir(), ".codex-web-console");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  codexExecutablePath: "codex",
  defaultRepoRoot: os.homedir(),
  serverBindHost: "127.0.0.1",
  serverPort: 8787,
  theme: "dark"
};

function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function validateHost(value: string): string {
  const host = value.trim();
  if (!host) {
    throw new Error("Server bind host is required.");
  }

  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Use 127.0.0.1 or localhost for local-only access.");
  }

  return host;
}

function validatePort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("Server port must be a whole number between 1 and 65535.");
  }

  return value;
}

function validateExecutablePath(value: string): string {
  const executablePath = value.trim();
  if (!executablePath) {
    throw new Error("Codex executable path is required.");
  }

  return executablePath;
}

function validateRepoRoot(value: string): string {
  const repoRoot = path.resolve(value.trim() || os.homedir());
  if (!fs.existsSync(repoRoot)) {
    throw new Error(`Default repo root does not exist: ${repoRoot}`);
  }

  if (!fs.statSync(repoRoot).isDirectory()) {
    throw new Error(`Default repo root is not a directory: ${repoRoot}`);
  }

  return repoRoot;
}

function validateTheme(value: string): ThemeSetting {
  if (value !== "light" && value !== "dark") {
    throw new Error("Theme must be light or dark.");
  }

  return value;
}

export function validateConfig(input: Partial<AppConfig>): AppConfig {
  return {
    codexExecutablePath: validateExecutablePath(input.codexExecutablePath ?? DEFAULT_CONFIG.codexExecutablePath),
    defaultRepoRoot: validateRepoRoot(input.defaultRepoRoot ?? DEFAULT_CONFIG.defaultRepoRoot),
    serverBindHost: validateHost(input.serverBindHost ?? DEFAULT_CONFIG.serverBindHost),
    serverPort: validatePort(input.serverPort ?? DEFAULT_CONFIG.serverPort),
    theme: validateTheme(input.theme ?? DEFAULT_CONFIG.theme)
  };
}

export function loadConfig(): AppConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return validateConfig(parsed);
  } catch {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(input: Partial<AppConfig>): AppConfig {
  ensureConfigDir();
  const nextConfig = validateConfig(input);
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  return nextConfig;
}

export function getDefaultConfig(): AppConfig {
  return DEFAULT_CONFIG;
}
