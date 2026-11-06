import type { Request, Response } from "express";
import { autoCleanElements } from "../services/ai.service";
import {
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  applyBoardOps,
  VersionConflictError
} from "../services/board.service";
import {
  saveBase64Image,
  ImageValidationError,
  ImageSizeLimitError,
  StorageBackendError
} from "../utils/storage";

function getParamId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export async function createBoardController(_request: Request, response: Response) {
  try {
    const board = await createBoard();
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
    const board = await getBoard(boardId);

    if (!board) {
      response.status(404).json({ error: "Board not found." });
      return;
    }

    response.json(board);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load board."
    });
  }
}

export async function updateBoardController(request: Request, response: Response) {
  try {
    const boardId = getParamId(request.params.id);
    const role = (request.query.role as string) || (request.headers["x-board-role"] as string);
    if (role === "viewer") {
      response.status(403).json({ error: "Board is in view-only mode." });
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
    const role = (request.query.role as string) || (request.headers["x-board-role"] as string);
    if (role === "viewer") {
      response.status(403).json({ error: "Cannot delete board in view-only mode." });
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

