import type { ToolType } from "@shared/types";

export const TOOL_OPTIONS: Array<{
  id: ToolType;
  label: string;
  shortcut: string;
  icon: string;
}> = [
  { id: "pan", label: "Hand (Panning tool)", shortcut: "H", icon: "✋" },
  { id: "select", label: "Selection", shortcut: "V", icon: "↖" },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: "▭" },
  { id: "diamond", label: "Diamond", shortcut: "D", icon: "◇" },
  { id: "circle", label: "Ellipse", shortcut: "O", icon: "◯" },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: "→" },
  { id: "line", label: "Line", shortcut: "L", icon: "—" },
  { id: "pencil", label: "Draw", shortcut: "P", icon: "✏️" },
  { id: "text", label: "Text", shortcut: "T", icon: "T" },
  { id: "sticky", label: "Sticky Note", shortcut: "N", icon: "🗒" },
  { id: "image", label: "Insert Image", shortcut: "I", icon: "🖼" },
  { id: "eraser", label: "Eraser", shortcut: "E", icon: "⌫" },
  { id: "laser", label: "Laser Pointer", shortcut: "K", icon: "✦" }
];
