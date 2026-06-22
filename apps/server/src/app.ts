import express, { type Response } from "express";
import { loadConfig, saveConfig, type AppConfig } from "./config.js";
import { saveUploadedAttachment } from "./attachments.js";
import { savePastedDocument } from "./documents.js";
import { getGitDiff } from "./git-diff.js";
import { getGitStatus } from "./git-status.js";
import { createRecentProjectsStore } from "./recent-projects.js";
import { createProject } from "./projects.js";
import { SessionManager } from "./session.js";
import { handleUploadMiddlewareError, type AttachmentUploadRequest, uploadSingleAttachment } from "./upload-middleware.js";

export type AppServices = {
  getConfig(): AppConfig;
  setConfig(nextConfig: AppConfig): void;
  sessionManager: SessionManager;
  recentProjects: ReturnType<typeof createRecentProjectsStore>;
};

export function createServices(initialConfig?: AppConfig): AppServices {
  let appConfig = initialConfig ?? loadConfig();
  const recentProjects = createRecentProjectsStore();
  const sessionManager = new SessionManager(() => appConfig, (repoPath) => {
    recentProjects.recordProjectOpen(repoPath);
  });

  return {
    getConfig: () => appConfig,
    setConfig: (nextConfig) => {
      appConfig = nextConfig;
    },
    sessionManager,
    recentProjects
  };
}

export function createApp(services: AppServices) {
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  const readString = (value: unknown): string => (typeof value === "string" ? value : "");
  const sendBadRequest = (response: Response, fallbackMessage: string, error: unknown) => {
    response.status(400).json({
      error: error instanceof Error ? error.message : fallbackMessage
    });
  };

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/sessions", (_request, response) => {
    response.json({
      items: services.sessionManager.listSessions(10)
    });
  });

  app.get("/api/sessions/:id/transcript", (request, response) => {
    const transcript =
      request.query.format === "raw"
        ? services.sessionManager.getRawTranscript(request.params.id)
        : services.sessionManager.getTranscript(request.params.id);
    if (transcript === null) {
      response.status(404).json({ error: "Session transcript not found." });
      return;
    }

    response.type("text/plain").send(transcript);
  });

  app.get("/api/settings", (_request, response) => {
    response.json(services.getConfig());
  });

  app.get("/api/recent-projects", (_request, response) => {
    response.json({
      items: services.recentProjects.listRecentProjects()
    });
  });

  app.post("/api/settings", (request, response) => {
    try {
      const nextConfig = saveConfig(request.body as Partial<AppConfig>);
      services.setConfig(nextConfig);
      response.json({
        settings: nextConfig,
        message: "Settings saved. Restart the server for host or port changes to take effect."
      });
    } catch (error) {
      sendBadRequest(response, "Could not save settings.", error);
    }
  });

  app.get("/api/git/status", async (request, response) => {
    try {
      const repoPath = readString(request.query.repoPath);
      const status = await getGitStatus(repoPath);
      response.json(status);
    } catch (error) {
      sendBadRequest(response, "Could not read Git status.", error);
    }
  });

  app.get("/api/git/diff", async (request, response) => {
    try {
      const repoPath = readString(request.query.repoPath);
      const diff = await getGitDiff(repoPath);
      response.json(diff);
    } catch (error) {
      sendBadRequest(response, "Could not read Git diff.", error);
    }
  });

  app.post("/api/documents", (request, response) => {
    try {
      const repoPath = readString(request.body?.repoPath);
      const content = readString(request.body?.content);
      const document = savePastedDocument(repoPath, content);
      response.json(document);
    } catch (error) {
      sendBadRequest(response, "Could not save pasted document.", error);
    }
  });

  app.post("/api/projects", (request, response) => {
    try {
      const project = createProject({
        repoPath: readString(request.body?.repoPath),
        createFolder: Boolean(request.body?.createFolder),
        initializeGit: Boolean(request.body?.initializeGit),
        createReadme: Boolean(request.body?.createReadme)
      });
      response.json(project);
    } catch (error) {
      sendBadRequest(response, "Could not create the project folder.", error);
    }
  });

  app.post("/api/attachments", (request, response) => {
    uploadSingleAttachment(request, response, async (uploadError) => {
      if (handleUploadMiddlewareError(response, uploadError)) {
        return;
      }

      try {
        const repoPath = readString(request.body?.repoPath);
        const uploadRequest = request as AttachmentUploadRequest;
        if (!uploadRequest.file) {
          throw new Error("Choose a file to attach.");
        }

        const attachment = await saveUploadedAttachment({
          repoPath,
          file: uploadRequest.file,
          overrideFileName: readString(request.body?.overrideFileName) || undefined
        });

        response.json(attachment);
      } catch (error) {
        sendBadRequest(response, "Could not upload attachment.", error);
      }
    });
  });

  return app;
}
