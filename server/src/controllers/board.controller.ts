import type { Request, Response } from "express";
import { autoCleanElements } from "../services/ai.service";
import { createBoard, getBoard, updateBoard } from "../services/board.service";

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
      message: error instanceof Error ? error.message : "Failed to create board."
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
      message: error instanceof Error ? error.message : "Failed to load board."
    });
  }
}

export async function updateBoardController(request: Request, response: Response) {
  try {
    const board = await updateBoard(
      getParamId(request.params.id),
      request.body.elements ?? []
    );
    response.json(board);
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : "Failed to update board."
    });
  }
}

export async function cleanBoardController(request: Request, response: Response) {
  try {
    const elements = autoCleanElements(request.body.elements ?? []);
    response.json({ elements });
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : "Failed to clean elements."
    });
  }
}
