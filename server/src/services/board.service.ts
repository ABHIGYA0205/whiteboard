import { randomUUID } from "crypto";
import { BoardModel } from "../models/Board";
import type { BoardDocument, WhiteboardElement } from "@shared/types";

export async function createBoard(id: string = randomUUID()): Promise<BoardDocument> {
  const existing = await BoardModel.findOne({ id }).lean<BoardDocument | null>();
  if (existing) {
    return existing;
  }

  const board = await BoardModel.create({
    id,
    elements: []
  });

  return board.toObject() as BoardDocument;
}

export async function getBoard(id: string): Promise<BoardDocument | null> {
  return BoardModel.findOne({ id }).lean<BoardDocument | null>();
}

export async function updateBoard(
  id: string,
  elements: WhiteboardElement[]
): Promise<BoardDocument> {
  const board = await BoardModel.findOneAndUpdate(
    { id },
    { $set: { elements } },
    { new: true, upsert: true }
  ).lean<BoardDocument | null>();

  if (!board) {
    throw new Error("Board could not be updated.");
  }

  return board;
}
