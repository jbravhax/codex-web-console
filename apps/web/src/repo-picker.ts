export const REPO_PICKER_UNSUPPORTED_MESSAGE =
  "This browser cannot provide a local project-folder path here. Paste the project folder path manually.";

export const REPO_PICKER_MISSING_PATH_MESSAGE =
  "The browser let you choose a folder, but it did not expose a usable full path to the app. Paste the project folder path manually.";

export type DirectoryPickerHandle = {
  name?: string;
  path?: string;
};

export type DirectoryPickerHost = {
  showDirectoryPicker?: () => Promise<DirectoryPickerHandle>;
};

export type RepoDirectoryPickerResult =
  | {
      kind: "selected";
      repoPath: string;
    }
  | {
      kind: "unsupported";
      message: string;
    }
  | {
      kind: "missing-path";
      message: string;
    }
  | {
      kind: "cancelled";
    };

function isUsableAbsolutePath(pathValue: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(pathValue);
}

export function resolveRepoPathFromHandle(handle: DirectoryPickerHandle): string | null {
  if (typeof handle.path !== "string") {
    return null;
  }

  const normalizedPath = handle.path.trim();
  if (!normalizedPath || !isUsableAbsolutePath(normalizedPath)) {
    return null;
  }

  return normalizedPath;
}

function isPickerCancel(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string" &&
    error.name === "AbortError"
  );
}

export async function chooseRepoDirectory(
  host: DirectoryPickerHost = window as unknown as DirectoryPickerHost
): Promise<RepoDirectoryPickerResult> {
  if (typeof host.showDirectoryPicker !== "function") {
    return {
      kind: "unsupported",
      message: REPO_PICKER_UNSUPPORTED_MESSAGE
    };
  }

  try {
    const handle = await host.showDirectoryPicker();
    const repoPath = resolveRepoPathFromHandle(handle);

    if (repoPath) {
      return {
        kind: "selected",
        repoPath
      };
    }

    return {
      kind: "missing-path",
      message: REPO_PICKER_MISSING_PATH_MESSAGE
    };
  } catch (error) {
    if (isPickerCancel(error)) {
      return {
        kind: "cancelled"
      };
    }

    throw error;
  }
}
