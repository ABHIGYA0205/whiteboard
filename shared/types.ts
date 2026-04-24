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
  | "image";

export type Point = {
  x: number;
  y: number;
};

export type ElementType = Exclude<ToolType, "select" | "pan" | "eraser">;

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
};

export type BoardDocument = {
  id: string;
  elements: WhiteboardElement[];
  createdAt: string;
  updatedAt?: string;
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
