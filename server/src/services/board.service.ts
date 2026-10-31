import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { BoardModel } from "../models/Board";
import { saveBase64Image } from "../utils/storage";
import type { BoardDocument, BoardOp, WhiteboardElement } from "@shared/types";

export class VersionConflictError extends Error {
  constructor(public currentVersion: number) {
    super(`Version conflict: board is at version ${currentVersion}`);
    this.name = "VersionConflictError";
  }
}

// In-memory store fallback when MongoDB is offline or reconnecting
const inMemoryBoards = new Map<string, BoardDocument>();

function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function toBoardDocument(doc: any): BoardDocument {
  return {
    id: doc.id,
    version: typeof doc.version === "number" ? doc.version : 0,
    title: doc.title || "Untitled Board",
    ownerId: doc.ownerId,
    shareToken: doc.shareToken,
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
      points: el.points ?? []
    })),
    createdAt: typeof doc.createdAt === "string" ? doc.createdAt : (doc.createdAt?.toISOString?.() || new Date().toISOString()),
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : (doc.updatedAt?.toISOString?.() || new Date().toISOString())
  };
}

export async function createBoard(
  id: string = randomUUID(),
  ownerId?: string
): Promise<BoardDocument> {
  if (isMongoConnected()) {
    try {
      const existing = await BoardModel.findOne({ id }).lean();
      if (existing) {
        const doc = toBoardDocument(existing);
        inMemoryBoards.set(id, doc);
        return doc;
      }

      const board = await BoardModel.create({
        id,
        version: 0,
        ownerId: ownerId || randomUUID(),
        shareToken: randomUUID(),
        elements: []
      });

      const doc = toBoardDocument(board.toObject());
      inMemoryBoards.set(id, doc);
      return doc;
    } catch {
      // Fallback to in-memory below if Mongo throws
    }
  }

  // In-memory fallback
  if (inMemoryBoards.has(id)) {
    return inMemoryBoards.get(id)!;
  }

  const memoryDoc: BoardDocument = {
    id,
    version: 0,
    ownerId: ownerId || randomUUID(),
    shareToken: randomUUID(),
    elements: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  inMemoryBoards.set(id, memoryDoc);
  return memoryDoc;
}

export async function getBoard(id: string): Promise<BoardDocument | null> {
  if (isMongoConnected()) {
    try {
      const board = await BoardModel.findOne({ id }).lean();
      if (board) {
        const doc = toBoardDocument(board);
        inMemoryBoards.set(id, doc);
        return doc;
      }
    } catch {
      // Fall through to in-memory store
    }
  }

  return inMemoryBoards.get(id) || null;
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

/**
 * A client save is a full snapshot of *that client's* view, which is always
 * slightly behind reality: it does not contain the shape a collaborator drew
 * half a second ago. Blindly $set-ing it therefore erases other people's work.
 * So an incoming save is applied as "upserts + explicit tombstones": anything
 * stored that the payload does not mention, and that was not explicitly
 * deleted, is kept.
 */
function mergeForStorage(
  stored: WhiteboardElement[],
  incoming: WhiteboardElement[],
  deletedIds: Iterable<string>
): { elements: WhiteboardElement[]; deletedElementIds: string[] } {
  const deleted = new Set<string>(deletedIds);
  const incomingIds = new Set(incoming.map((element) => element.id));

  const merged = [
    ...incoming.filter((element) => !deleted.has(element.id)),
    ...stored.filter(
      (element) => !incomingIds.has(element.id) && !deleted.has(element.id)
    )
  ];

  return { elements: merged, deletedElementIds: Array.from(deleted) };
}

export async function updateBoard(
  id: string,
  elements: WhiteboardElement[],
  expectedVersion?: number,
  deletedIds: Iterable<string> = []
): Promise<BoardDocument> {
  const sanitized = await sanitizeElements(elements);
  const incomingDeleted = Array.from(deletedIds);

  if (isMongoConnected()) {
    try {
      if (expectedVersion !== undefined) {
        const existing: any = await BoardModel.findOne({ id }).lean();
        if (existing && existing.version !== expectedVersion) {
          throw new VersionConflictError(existing.version);
        }

        const stored: any[] = (existing?.elements as any[]) || [];
        const { elements: mergedElements, deletedElementIds } = mergeForStorage(
          stored as WhiteboardElement[],
          sanitized,
          [...incomingDeleted, ...((existing?.deletedElementIds as string[]) || [])]
        );

        const board: any = await BoardModel.findOneAndUpdate(
          { id, version: expectedVersion },
          { $set: { elements: mergedElements, deletedElementIds }, $inc: { version: 1 } },
          { new: true, runValidators: true }
        ).lean();

        if (!board) {
          const current: any = await BoardModel.findOne({ id }).lean();
          if (current) {
            throw new VersionConflictError(current.version);
          }
          const created = await BoardModel.create({
            id,
            version: 1,
            ownerId: randomUUID(),
            shareToken: randomUUID(),
            elements: sanitized
          });
          const doc = toBoardDocument(created.toObject());
          inMemoryBoards.set(id, doc);
          return doc;
        }

        const doc = toBoardDocument(board);
        inMemoryBoards.set(id, doc);
        return doc;
      }

      // Without version check, atomic upsert with version increment
      const existingForMerge: any = await BoardModel.findOne({ id }).lean();
      const { elements: mergedElements, deletedElementIds } = mergeForStorage(
        ((existingForMerge?.elements as any[]) || []) as WhiteboardElement[],
        sanitized,
        [...incomingDeleted, ...((existingForMerge?.deletedElementIds as string[]) || [])]
      );

      const board: any = await BoardModel.findOneAndUpdate(
        { id },
        { $set: { elements: mergedElements, deletedElementIds }, $inc: { version: 1 } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean();

      if (!board) {
        throw new Error("Board could not be updated.");
      }

      const doc = toBoardDocument(board);
      inMemoryBoards.set(id, doc);
      return doc;
    } catch (err) {
      if (err instanceof VersionConflictError) throw err;
      // If Mongo network error, fallback to in-memory store
    }
  }

  // In-memory fallback
  const existingDoc = inMemoryBoards.get(id);
  const currentDoc: BoardDocument = existingDoc || {
    id,
    version: 0,
    ownerId: randomUUID(),
    shareToken: randomUUID(),
    elements: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (expectedVersion !== undefined && currentDoc.version !== expectedVersion) {
    throw new VersionConflictError(currentDoc.version);
  }

  const { elements: mergedElements, deletedElementIds } = mergeForStorage(
    currentDoc.elements || [],
    sanitized,
    [...incomingDeleted, ...((currentDoc.deletedElementIds as string[]) || [])]
  );

  const updatedDoc: BoardDocument = {
    ...currentDoc,
    elements: mergedElements,
    deletedElementIds,
    version: currentDoc.version + 1,
    updatedAt: new Date().toISOString()
  };

  inMemoryBoards.set(id, updatedDoc);
  return updatedDoc;
}

export async function applyBoardOps(
  id: string,
  ops: BoardOp[],
  expectedVersion?: number
): Promise<BoardDocument> {
  if (isMongoConnected()) {
    try {
      const board = await BoardModel.findOne({ id });
      if (board) {
        if (expectedVersion !== undefined && board.version !== expectedVersion) {
          throw new VersionConflictError(board.version);
        }

        let elements: WhiteboardElement[] = (board.elements as unknown as WhiteboardElement[]) || [];

        for (const op of ops) {
          let sanitizedElement = op.element;
          if (sanitizedElement.type === "image" && sanitizedElement.imageUrl?.startsWith("data:")) {
            const url = await saveBase64Image(sanitizedElement.imageUrl);
            sanitizedElement = { ...sanitizedElement, imageUrl: url };
          }

          const idx = elements.findIndex((el) => el.id === sanitizedElement.id);
          if (op.op === "add" || op.op === "update") {
            if (idx >= 0) {
              elements[idx] = sanitizedElement;
            } else {
              elements.push(sanitizedElement);
            }
          } else if (op.op === "delete") {
            elements = elements.filter((el) => el.id !== sanitizedElement.id);
          }
        }

        board.elements = elements as any;
        board.version = (board.version || 0) + 1;
        await board.save({ validateBeforeSave: true });

        const doc = toBoardDocument(board.toObject());
        inMemoryBoards.set(id, doc);
        return doc;
      }
    } catch (err) {
      if (err instanceof VersionConflictError) throw err;
      // Fall through to in-memory store
    }
  }

  // In-memory fallback
  const currentDoc = inMemoryBoards.get(id);
  if (!currentDoc) {
    throw new Error(`Board ${id} not found.`);
  }

  if (expectedVersion !== undefined && currentDoc.version !== expectedVersion) {
    throw new VersionConflictError(currentDoc.version);
  }

  let elements = [...currentDoc.elements];
  for (const op of ops) {
    let sanitizedElement = op.element;
    if (sanitizedElement.type === "image" && sanitizedElement.imageUrl?.startsWith("data:")) {
      const url = await saveBase64Image(sanitizedElement.imageUrl);
      sanitizedElement = { ...sanitizedElement, imageUrl: url };
    }

    const idx = elements.findIndex((el) => el.id === sanitizedElement.id);
    if (op.op === "add" || op.op === "update") {
      if (idx >= 0) {
        elements[idx] = sanitizedElement;
      } else {
        elements.push(sanitizedElement);
      }
    } else if (op.op === "delete") {
      elements = elements.filter((el) => el.id !== sanitizedElement.id);
    }
  }

  const updatedDoc: BoardDocument = {
    ...currentDoc,
    elements,
    version: currentDoc.version + 1,
    updatedAt: new Date().toISOString()
  };

  inMemoryBoards.set(id, updatedDoc);
  return updatedDoc;
}

export async function deleteBoard(id: string): Promise<boolean> {
  if (isMongoConnected()) {
    try {
      await BoardModel.deleteOne({ id });
    } catch {
      // fallback to memory
    }
  }
  inMemoryBoards.delete(id);
  return true;
}
