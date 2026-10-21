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
    ownerId: doc.ownerId,
    shareToken: doc.shareToken,
    elements: (doc.elements || []) as WhiteboardElement[],
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

export async function updateBoard(
  id: string,
  elements: WhiteboardElement[],
  expectedVersion?: number
): Promise<BoardDocument> {
  const sanitized = await sanitizeElements(elements);

  if (isMongoConnected()) {
    try {
      if (expectedVersion !== undefined) {
        const existing: any = await BoardModel.findOne({ id }).lean();
        if (existing && existing.version !== expectedVersion) {
          throw new VersionConflictError(existing.version);
        }

        const board: any = await BoardModel.findOneAndUpdate(
          { id, version: expectedVersion },
          { $set: { elements: sanitized }, $inc: { version: 1 } },
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
      const board: any = await BoardModel.findOneAndUpdate(
        { id },
        { $set: { elements: sanitized }, $inc: { version: 1 } },
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

  const updatedDoc: BoardDocument = {
    ...currentDoc,
    elements: sanitized,
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
