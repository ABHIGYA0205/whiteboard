import type { Request, Response } from "express";
import { autoCleanElements } from "../services/ai.service";
import {
  createBoard,
  getBoard,
  updateBoard,
  applyBoardOps,
  VersionConflictError
} from "../services/board.service";
import { saveBase64Image } from "../utils/storage";

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
      const created = await createBoard(boardId);
      response.json(created);
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
    const { elements, version } = request.body;

    if (!Array.isArray(elements)) {
      response.status(400).json({ error: "elements array is required." });
      return;
    }

    const board = await updateBoard(boardId, elements, typeof version === "number" ? version : undefined);
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
      response.status(400).json({ error: "imageBase64 is required." });
      return;
    }

    const url = await saveBase64Image(imageBase64);
    response.json({ url });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to upload image."
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
