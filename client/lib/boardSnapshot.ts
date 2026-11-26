import type { WhiteboardElement } from "@shared/types";
import { DEFAULT_BOARD_TITLE, MAX_BOARD_TITLE_LENGTH } from "@shared/types";

export async function readBoardSnapshot(file: File): Promise<{ title: string; elements: WhiteboardElement[] }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a board file smaller than 10 MB.");

  let elements: unknown;
  try {
    elements = JSON.parse(await file.text());
  } catch {
    throw new Error("Choose a valid Canvas Flow JSON export.");
  }

  if (!Array.isArray(elements)) throw new Error("Choose a valid Canvas Flow JSON export.");
  const title = file.name.replace(/\.json$/i, "").trim().slice(0, MAX_BOARD_TITLE_LENGTH);
  return { title: title || DEFAULT_BOARD_TITLE, elements };
}
