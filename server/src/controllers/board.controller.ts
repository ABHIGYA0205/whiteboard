import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { autoCleanElements } from "../services/ai.service";
import {
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  applyBoardOps,
  claimBoard,
  hasValidTokenOwner,
  VersionConflictError
} from "../services/board.service";
import {
  saveBase64Image,
  ImageValidationError,
  ImageSizeLimitError,
  StorageBackendError
} from "../utils/storage";
import { signBoardToken, verifyBoardToken, BoardRole } from "../utils/token";
import { env } from "../utils/env";
import type { BoardDocument } from "@shared/types";

function getParamId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export function extractToken(request: Request): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      const t = parts[1].trim();
      if (t) return t;
    }
  }
  const queryToken = request.query.token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }
  const headerToken = request.headers["x-board-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }
  return null;
}

type AuthResult =
  | { ok: true; board: BoardDocument; role?: BoardRole }
  | { ok: false };

async function authorizeBoard(
  request: Request,
  response: Response,
  boardId: string,
  allowedRoles: BoardRole[]
): Promise<AuthResult> {
  const board = await getBoard(boardId);
  if (!board) {
    response.status(404).json({ error: "Board not found." });
    return { ok: false };
  }

  const isClaimed = hasValidTokenOwner(board.ownerId);
  const token = extractToken(request);

  if (!isClaimed) {
    if (token) {
      const verified = verifyBoardToken(token, boardId);
      if (verified.valid) {
        if (!allowedRoles.includes(verified.payload.role)) {
          response.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
          return { ok: false };
        }
        return { ok: true, board, role: verified.payload.role };
      }
    }
    if (!allowedRoles.includes("editor")) {
      response.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      return { ok: false };
    }
    return { ok: true, board, role: "editor" };
  }

  if (!token) {
    response.status(401).json({ error: "Token required", code: "TOKEN_REQUIRED" });
    return { ok: false };
  }

  const verified = verifyBoardToken(token, boardId);
  if (!verified.valid) {
    response.status(401).json({ error: "Invalid or expired token", code: "TOKEN_INVALID" });
    return { ok: false };
  }

  if (!allowedRoles.includes(verified.payload.role)) {
    response.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    return { ok: false };
  }

  return { ok: true, board, role: verified.payload.role };
}

export async function createBoardController(request: Request, response: Response) {
  try {
    let legacyOwnerId: string | undefined;
    if (process.env.NODE_ENV !== "production") {
      if (request.query.legacy === "true" || Boolean(request.body?.legacy)) {
        legacyOwnerId =
          typeof request.body?.ownerId === "string"
            ? request.body.ownerId
            : randomUUID();
      }
    }
    const board = await createBoard(undefined, legacyOwnerId);
    response.status(201).json(board);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create board."
    });
  }
}

export async function getBoardController(request: Request, response: Response) {
  try {
    const boardId = getParamId(request.params.id);
    const auth = await authorizeBoard(request, response, boardId, ["owner", "editor", "viewer"]);
    if (!auth.ok) {
      return;
    }

    response.json(auth.board);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load board."
    });
  }
}

export async function updateBoardController(request: Request, response: Response) {
  try {
    const boardId = getParamId(request.params.id);
    const auth = await authorizeBoard(request, response, boardId, ["owner", "editor"]);
    if (!auth.ok) {
      return;
    }

    const { elements, version, deletedIds } = request.body;

    if (!Array.isArray(elements)) {
      response.status(400).json({ error: "elements array is required." });
      return;
    }

    const board = await updateBoard(
      boardId,
      elements,
      typeof version === "number" ? version : undefined,
      Array.isArray(deletedIds) ? deletedIds : []
    );
    response.json(board);
  } catch (error: any) {
    if (error instanceof VersionConflictError) {
      response.status(409).json({
        error: error.message,
        currentVersion: error.currentVersion
      });
      return;
    }

    if (error?.name === "ValidationError") {
      response.status(400).json({ error: error.message });
      return;
    }

    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update board."
    });
  }
}

export async function applyBoardOpsController(request: Request, response: Response) {
  try {
    const boardId = getParamId(request.params.id);
    const auth = await authorizeBoard(request, response, boardId, ["owner", "editor"]);
    if (!auth.ok) {
      return;
    }

    const { ops, op, element, version } = request.body;

    let opList = ops;
    if (!opList && op && element) {
      opList = [{ op, element }];
    }

    if (!Array.isArray(opList) || opList.length === 0) {
      response.status(400).json({ error: "ops array or single op+element required." });
      return;
    }

    const board = await applyBoardOps(
      boardId,
      opList,
      typeof version === "number" ? version : undefined
    );
    response.json(board);
  } catch (error: any) {
    if (error instanceof VersionConflictError) {
      response.status(409).json({
        error: error.message,
        currentVersion: error.currentVersion
      });
      return;
    }

    if (error?.name === "ValidationError") {
      response.status(400).json({ error: error.message });
      return;
    }

    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to apply operations."
    });
  }
}

export async function claimBoardController(request: Request, response: Response) {
  try {
    const boardId = getParamId(request.params.id);
    const result = await claimBoard(boardId);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.json(result);
  } catch (error: any) {
    if (error?.message === "ALREADY_CLAIMED") {
      response.status(409).json({ error: "Board is already claimed.", code: "ALREADY_CLAIMED" });
      return;
    }
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to claim board."
    });
  }
}

export async function shareBoardController(request: Request, response: Response) {
  try {
    const boardId = getParamId(request.params.id);
    const auth = await authorizeBoard(request, response, boardId, ["owner"]);
    if (!auth.ok) {
      return;
    }

    const requestedRole = request.body?.role;
    if (requestedRole !== "editor" && requestedRole !== "viewer") {
      response.status(400).json({ error: "Role must be 'editor' or 'viewer'." });
      return;
    }

    let ttlHours = typeof request.body?.ttlHours === "number" ? request.body.ttlHours : 168;
    if (ttlHours > 720) ttlHours = 720;
    if (ttlHours < 0) ttlHours = 0;

    const token = signBoardToken(boardId, requestedRole, ttlHours);
    const clientOrigin = env.clientOrigin;
    const url = `${clientOrigin}/board/${boardId}?share=${token}`;

    response.json({ token, url });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create share link."
    });
  }
}

export async function uploadImageController(request: Request, response: Response) {
  try {
    const { imageBase64 } = request.body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      response.status(400).json({ error: "imageBase64 is required.", code: "INVALID_REQUEST" });
      return;
    }

    const url = await saveBase64Image(imageBase64);
    response.json({ url });
  } catch (error: any) {
    if (
      error instanceof ImageSizeLimitError ||
      error?.statusCode === 413 ||
      error?.code === "PAYLOAD_TOO_LARGE" ||
      error?.type === "entity.too.large" ||
      /exceeds maximum allowed size|payload too large|too large/i.test(error?.message || "")
    ) {
      response.status(413).json({
        error: error.message || "Image exceeds maximum allowed size of 8 MB",
        code: error.code || "PAYLOAD_TOO_LARGE"
      });
      return;
    }

    if (
      error instanceof ImageValidationError ||
      error?.statusCode === 400 ||
      error?.code === "INVALID_IMAGE" ||
      error?.code === "UNSUPPORTED_IMAGE_TYPE" ||
      error?.code === "EMPTY_IMAGE" ||
      /unsupported image type|invalid image|invalid data url/i.test(error?.message || "")
    ) {
      response.status(400).json({
        error: error.message || "Invalid image",
        code: error.code || "INVALID_IMAGE"
      });
      return;
    }

    if (
      error instanceof StorageBackendError ||
      error?.statusCode === 503 ||
      error?.code === "STORAGE_ERROR" ||
      /storage|s3|disk|unavailable/i.test(error?.message || "")
    ) {
      response.status(503).json({
        error: error.message || "Storage service unavailable",
        code: error.code || "STORAGE_ERROR"
      });
      return;
    }

    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to upload image.",
      code: "INTERNAL_ERROR"
    });
  }
}

export async function cleanBoardController(request: Request, response: Response) {
  try {
    const elements = autoCleanElements(request.body.elements ?? []);
    response.json({ elements });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to clean elements."
    });
  }
}

export async function deleteBoardController(request: Request, response: Response) {
  try {
    const boardId = getParamId(request.params.id);
    const auth = await authorizeBoard(request, response, boardId, ["owner", "editor"]);
    if (!auth.ok) {
      return;
    }

    await deleteBoard(boardId);
    response.json({ success: true, message: `Board ${boardId} deleted.` });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to delete board."
    });
  }
}

