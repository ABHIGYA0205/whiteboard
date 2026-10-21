export type ToolType =
  | "select"
  | "pan"
  | "eraser"
  | "pencil"
  | "rectangle"
  | "circle"
  | "line"
  | "arrow"
  | "text"
  | "image"
  | "sticky"
  | "laser";

export type Point = {
  x: number;
  y: number;
};

export type ElementType = Exclude<ToolType, "select" | "pan" | "eraser" | "laser">;

export type WhiteboardElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string;
  text?: string;
  fontSize?: number;
  imageUrl?: string;
  opacity?: number;
  isLocked?: boolean;
  points: Point[];
};

export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type CursorPosition = {
  userId: string;
  x: number;
  y: number;
  color: string;
  name?: string;
  lastSeen?: number;
};

export type PresenceUser = {
  userId: string;
  name: string;
  color: string;
};

export type BoardDocument = {
  id: string;
  version: number;
  ownerId?: string;
  shareToken?: string;
  elements: WhiteboardElement[];
  createdAt: string;
  updatedAt?: string;
};

export type BoardOp = {
  op: "add" | "update" | "delete";
  element: WhiteboardElement;
};

export type DrawEventPayload = {
  boardId: string;
  element: WhiteboardElement;
};

export type CursorEventPayload = {
  boardId: string;
  cursor: CursorPosition;
};

export type UpdateElementPayload = DrawEventPayload;

export type PresenceLeavePayload = {
  boardId: string;
  userId: string;
};

export type LaserEventPayload = {
  boardId: string;
  userId: string;
  point: Point;
  color: string;
};
