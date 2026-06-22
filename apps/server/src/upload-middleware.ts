import multer, { MulterError } from "multer";
import type { Request, Response } from "express";
import { MAX_ZIP_UPLOAD_BYTES } from "./attachments.js";

export const uploadSingleAttachment = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ZIP_UPLOAD_BYTES
  }
}).single("file");

export function handleUploadMiddlewareError(response: Response, uploadError: unknown): boolean {
  if (uploadError instanceof MulterError && uploadError.code === "LIMIT_FILE_SIZE") {
    response.status(400).json({
      error: "Attachment is too large. The current upload limit is 50MB."
    });
    return true;
  }

  if (uploadError) {
    response.status(400).json({
      error: uploadError instanceof Error ? uploadError.message || "Could not upload attachment." : "Could not upload attachment."
    });
    return true;
  }

  return false;
}

export type AttachmentUploadRequest = Request & {
  file?: Express.Multer.File;
};
