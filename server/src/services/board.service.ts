import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { BoardModel } from "../models/Board";
import { saveBase64Image } from "../utils/storage";
import { signBoardToken, hashToken } from "../utils/token";
import type { BoardDocument, BoardOp, WhiteboardElement } from "@shared/types";

export class VersionConflictError extends Error {
  constructor(public currentVersion: number) {
    super(`Version conflict: board is at version ${currentVersion}`);
    this.name = "VersionConflictError";
  }
}

// In-memory store fallback when MongoDB is offline or reconnecting
const inMemoryBoards = new Map<string, BoardDocument>();

export class BoardStorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Board storage is unavailable. Try again shortly.");
    this.name = "BoardStorageUnavailableError";
    if (cause) console.error("Board storage error:", cause);
  }
}

function allowMemoryFallback() {
  if (process.env.NODE_ENV === "production") throw new BoardStorageUnavailableError();
}

export const SHA256_HEX = /^[0-9a-f]{64}$/;

export function hasValidTokenOwner(ownerId: any): boolean {
  return typeof ownerId === "string" && SHA256_HEX.test(ownerId.trim());
}

function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function toBoardDocument(doc: any): BoardDocument {
  const hasTokenOwner = hasValidTokenOwner(doc.ownerId);
  return {
    id: doc.id,
    version: typeof doc.version === "number" ? doc.version : 0,
    title: doc.title || "Untitled Board",
    ownerId: hasTokenOwner ? doc.ownerId.trim() : undefined,
    claimable: !hasTokenOwner,
    backgroundColor: doc.backgroundColor || "",
    deletedElementIds: doc.deletedElementIds || [],
    elements: (doc.elements || []).map((el: any) => ({
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      strokeColor: el.strokeColor,
      strokeWidth: el.strokeWidth,
      strokeStyle: el.strokeStyle ?? "solid",
      fillColor: el.fillColor ?? "transparent",
      fillStyle: el.fillStyle ?? "transparent",
      roughness: typeof el.roughness === "number" ? el.roughness : 0,
      roundness: el.roundness ?? false,
      text: el.text ?? "",
      fontSize: typeof el.fontSize === "number" ? el.fontSize : 24,
      imageUrl: el.imageUrl ?? "",
      opacity: typeof el.opacity === "number" ? el.opacity : 1,
      isLocked: Boolean(el.isLocked),
      startBinding: el.startBinding,
      endBinding: el.endBinding,
      // The layer number has to survive storage, or a layer change is lost on the next load.
      ...(typeof el.z === "number" ? { z: el.z } : {}),
      points: el.points ?? []
    })),
    createdAt: typeof doc.createdAt === "string" ? doc.createdAt : (doc.createdAt?.toISOString?.() || new Date().toISOString()),
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : (doc.updatedAt?.toISOString?.() || new Date().toISOString())
  };
}

export async function createBoard(
  id: string = randomUUID(),
  ownerId?: string
): Promise<BoardDocument & { ownerToken?: string }> {
  let ownerToken: string | undefined;
  let effectiveOwnerId = ownerId;
  if (effectiveOwnerId === undefined) {
    ownerToken = signBoardToken(id, "owner", 365 * 24);
    effectiveOwnerId = hashToken(ownerToken);
  }

  if (isMongoConnected()) {
    try {
      const existing = await BoardModel.findOne({ id }).lean();
      if (existing) {
        const doc = toBoardDocument(existing);
        return doc;
      }

      const board = await BoardModel.create({
        id,
        version: 0,
        ownerId: effectiveOwnerId,
        elements: []
      });

      const doc = toBoardDocument(board.toObject());
      return { ...doc, ownerToken };
    } catch (error) {
      throw new BoardStorageUnavailableError(error);
    }
  }

  allowMemoryFallback();
  if (inMemoryBoards.has(id)) {
    return toBoardDocument(inMemoryBoards.get(id)!);
  }

  const hasTokenOwner = hasValidTokenOwner(effectiveOwnerId);
  const memoryDoc: BoardDocument = {
    id,
    version: 0,
    ownerId: effectiveOwnerId,
    claimable: !hasTokenOwner,
    elements: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  inMemoryBoards.set(id, memoryDoc);
  return { ...toBoardDocument(memoryDoc), ownerToken };
}

export async function claimBoard(id: string): Promise<{ ownerToken: string; board: BoardDocument } | null> {
  const ownerToken = signBoardToken(id, "owner", 365 * 24);
  const ownerId = hashToken(ownerToken);

  if (isMongoConnected()) {
    // Claiming and editing may run in parallel. Claim only if the owner has not
    // changed since the read, and never write a stale copy of the elements.
    const existing = await BoardModel.findOne({ id }).select({ ownerId: 1 }).lean<{ ownerId?: string }>();
    if (!existing) return null;
    if (hasValidTokenOwner(existing.ownerId)) throw new Error("ALREADY_CLAIMED");
    const claimed = await BoardModel.findOneAndUpdate(
      { id, ownerId: existing.ownerId ?? null },
      { $set: { ownerId } },
      { new: true }
    ).lean();
    if (!claimed) throw new Error("ALREADY_CLAIMED");
    return { ownerToken, board: toBoardDocument(claimed) };
  }

  allowMemoryFallback();
  const memoryDoc = inMemoryBoards.get(id);
  if (!memoryDoc) {
    return null;
  }
  if (hasValidTokenOwner(memoryDoc.ownerId)) {
    throw new Error("ALREADY_CLAIMED");
  }

  const updatedDoc: BoardDocument = {
    ...memoryDoc,
    ownerId,
    claimable: false,
    updatedAt: new Date().toISOString()
  };
  inMemoryBoards.set(id, updatedDoc);
  return { ownerToken, board: toBoardDocument(updatedDoc) };
}

export async function getBoard(id: string): Promise<BoardDocument | null> {
  if (isMongoConnected()) {
    try {
      const board = await BoardModel.findOne({ id }).lean();
      return board ? toBoardDocument(board) : null;
    } catch (error) {
      throw new BoardStorageUnavailableError(error);
    }
  }

  allowMemoryFallback();
  const mem = inMemoryBoards.get(id);
  return mem ? toBoardDocument(mem) : null;
}

/**
 * Normalizes elements to ensure any base64 image data is moved out of Mongo
 * and replaced with a static URL path.
 */
async function sanitizeElements(elements: WhiteboardElement[]): Promise<WhiteboardElement[]> {
  return Promise.all(
    elements.map(async (element) => {
      if (element.type === "image" && element.imageUrl?.startsWith("data:")) {
        const url = await saveBase64Image(element.imageUrl);
        return { ...element, imageUrl: url };
      }
      return element;
    })
  );
}

type BoardChanges = Pick<BoardDocument, "elements" | "deletedElementIds">;

/** Apply only named changes, preserving the order of existing element ids. */
function mergeForStorage(
  board: BoardDocument,
  incoming: WhiteboardElement[],
  deletedIds: string[]
): BoardChanges {
  const deleted = new Set([...board.deletedElementIds ?? [], ...deletedIds]);
  const elements = new Map(board.elements.map((element) => [element.id, element]));
  for (const element of incoming) {
    if (!deleted.has(element.id)) elements.set(element.id, element);
  }
  for (const id of deletedIds) elements.delete(id);
  return { elements: Array.from(elements.values()), deletedElementIds: Array.from(deleted) };
}

// Serialize writes to the same board in this server. The version predicate
// still protects writes when another process updates the Mongo document.
const boardWrites = new Map<string, Promise<unknown>>();

function enqueueBoardWrite<T>(id: string, write: () => Promise<T>): Promise<T> {
  const result = (boardWrites.get(id) ?? Promise.resolve()).then(write);
  const settled = result.catch(() => undefined);
  boardWrites.set(id, settled);
  void settled.then(() => {
    if (boardWrites.get(id) === settled) boardWrites.delete(id);
  });
  return result;
}

export class BoardNotFoundError extends Error {
  constructor() {
    super("Board not found.");
    this.name = "BoardNotFoundError";
  }
}

async function writeBoard(
  id: string,
  expectedVersion: number | undefined,
  getChanges: (board: BoardDocument) => BoardChanges
): Promise<BoardDocument> {
  return enqueueBoardWrite(id, async () => {
    if (isMongoConnected()) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const existing = await getBoard(id);
        if (!existing) throw new BoardNotFoundError();
        if (expectedVersion !== undefined && existing.version !== expectedVersion) {
          throw new VersionConflictError(existing.version);
        }

        const updated = await BoardModel.findOneAndUpdate(
          { id, version: existing.version },
          { $set: getChanges(existing), $inc: { version: 1 } },
          { new: true, runValidators: true }
        ).lean();
        if (updated) return toBoardDocument(updated);
      }

      const current = await getBoard(id);
      if (!current) throw new BoardNotFoundError();
      throw new VersionConflictError(current.version);
    }

    allowMemoryFallback();
    const current = inMemoryBoards.get(id);
    if (!current) throw new BoardNotFoundError();
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError(current.version);
    }
    const updated = {
      ...current,
      ...getChanges(current),
      version: current.version + 1,
      updatedAt: new Date().toISOString()
    };
    inMemoryBoards.set(id, updated);
    return toBoardDocument(updated);
  });
}

export async function updateBoard(
  id: string,
  elements: WhiteboardElement[],
  expectedVersion?: number,
  deletedIds: Iterable<string> = []
): Promise<BoardDocument> {
  const sanitized = await sanitizeElements(elements);
  const deletes = Array.from(deletedIds);
  return writeBoard(id, expectedVersion, (board) => mergeForStorage(board, sanitized, deletes));
}

export async function applyBoardOps(
  id: string,
  ops: BoardOp[],
  expectedVersion?: number
): Promise<BoardDocument> {
  const elements = await sanitizeElements(ops.filter(({ op }) => op !== "delete").map(({ element }) => element));
  const deletedIds = ops.filter(({ op }) => op === "delete").map(({ element }) => element.id);
  return writeBoard(id, expectedVersion, (board) => mergeForStorage(board, elements, deletedIds));
}

export function deleteBoard(id: string): Promise<boolean> {
  return enqueueBoardWrite(id, async () => {
    if (isMongoConnected()) {
      await BoardModel.deleteOne({ id });
    } else {
      allowMemoryFallback();
    }
    inMemoryBoards.delete(id);
    return true;
  });
}
