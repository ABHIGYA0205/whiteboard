import type { ToolType } from "@shared/types";

export const TOOL_OPTIONS: Array<{
  id: ToolType;
  label: string;
  shortcut: string;
  icon: string;
}> = [
  { id: "select", label: "Select", shortcut: "V", icon: "↗" },
  { id: "pan", label: "Pan", shortcut: "H", icon: "✋" },
  { id: "pencil", label: "Pencil", shortcut: "P", icon: "✏️" },
  { id: "rectangle", label: "Rect", shortcut: "R", icon: "⬜" },
  { id: "circle", label: "Circle", shortcut: "O", icon: "⭕" },
  { id: "line", label: "Line", shortcut: "L", icon: "➖" },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: "↗️" },
  { id: "text", label: "Text", shortcut: "T", icon: "T" },
  { id: "eraser", label: "Erase", shortcut: "E", icon: "⌫" }
];
