import type { WhiteboardElement } from "@shared/types";

export type BoardTemplate = {
  id: string;
  title: string;
  description: string;
  category: string;
  generate: (originX: number, originY: number) => WhiteboardElement[];
};

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "flowchart",
    title: "User Flow / Architecture",
    description: "Multi-step flow diagram with structured nodes and connection arrows",
    category: "Architecture",
    generate: (originX, originY) => {
      const el1: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: originX,
        y: originY,
        width: 170,
        height: 65,
        strokeColor: "#3b82f6",
        fillColor: "rgba(59, 130, 246, 0.12)",
        strokeWidth: 2,
        text: "Step 1",
        points: []
      };
      const arrow1: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "arrow",
        x: originX + 170,
        y: originY + 32,
        width: 70,
        height: 0,
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        points: []
      };
      const el2: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: originX + 240,
        y: originY,
        width: 170,
        height: 65,
        strokeColor: "#8b5cf6",
        fillColor: "rgba(139, 92, 246, 0.12)",
        strokeWidth: 2,
        text: "Step 2",
        points: []
      };
      const arrow2: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "arrow",
        x: originX + 410,
        y: originY + 32,
        width: 70,
        height: 0,
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        points: []
      };
      const el3: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "circle",
        x: originX + 480,
        y: originY - 15,
        width: 95,
        height: 95,
        strokeColor: "#f59e0b",
        fillColor: "rgba(245, 158, 11, 0.12)",
        strokeWidth: 2,
        text: "Decision",
        points: []
      };
      const arrow3: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "arrow",
        x: originX + 575,
        y: originY + 32,
        width: 70,
        height: 0,
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        points: []
      };
      const el4: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: originX + 645,
        y: originY,
        width: 170,
        height: 65,
        strokeColor: "#10b981",
        fillColor: "rgba(16, 185, 129, 0.12)",
        strokeWidth: 2,
        text: "Result",
        points: []
      };
      return [el1, arrow1, el2, arrow2, el3, arrow3, el4];
    }
  },
  {
    id: "kanban",
    title: "Sprint Kanban Board",
    description: "3-column workflow board with column headers and blank sticky notes",
    category: "Agile",
    generate: (originX, originY) => {
      const colWidth = 260;
      const colHeight = 440;
      const gap = 30;

      // Column 1
      const col1: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: originX,
        y: originY,
        width: colWidth,
        height: colHeight,
        strokeColor: "#64748b",
        fillColor: "rgba(100, 116, 139, 0.08)",
        strokeWidth: 2,
        points: []
      };
      const title1: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: originX + 20,
        y: originY + 20,
        width: 180,
        height: 30,
        strokeColor: "#94a3b8",
        strokeWidth: 1,
        text: "TO DO",
        fontSize: 20,
        points: []
      };
      const note1: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + 30,
        y: originY + 65,
        width: 200,
        height: 140,
        strokeColor: "#ca8a04",
        fillColor: "#fef08a",
        strokeWidth: 1,
        text: "",
        points: []
      };
      const note2: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + 30,
        y: originY + 225,
        width: 200,
        height: 140,
        strokeColor: "#ea580c",
        fillColor: "#fed7aa",
        strokeWidth: 1,
        text: "",
        points: []
      };

      // Column 2
      const col2: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: originX + colWidth + gap,
        y: originY,
        width: colWidth,
        height: colHeight,
        strokeColor: "#3b82f6",
        fillColor: "rgba(59, 130, 246, 0.08)",
        strokeWidth: 2,
        points: []
      };
      const title2: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: originX + colWidth + gap + 20,
        y: originY + 20,
        width: 180,
        height: 30,
        strokeColor: "#60a5fa",
        strokeWidth: 1,
        text: "IN PROGRESS",
        fontSize: 20,
        points: []
      };
      const note3: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + colWidth + gap + 30,
        y: originY + 65,
        width: 200,
        height: 140,
        strokeColor: "#0284c7",
        fillColor: "#bae6fd",
        strokeWidth: 1,
        text: "",
        points: []
      };

      // Column 3
      const col3: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: originX + (colWidth + gap) * 2,
        y: originY,
        width: colWidth,
        height: colHeight,
        strokeColor: "#10b981",
        fillColor: "rgba(16, 185, 129, 0.08)",
        strokeWidth: 2,
        points: []
      };
      const title3: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: originX + (colWidth + gap) * 2 + 20,
        y: originY + 20,
        width: 180,
        height: 30,
        strokeColor: "#34d399",
        strokeWidth: 1,
        text: "DONE",
        fontSize: 20,
        points: []
      };
      const note4: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + (colWidth + gap) * 2 + 30,
        y: originY + 65,
        width: 200,
        height: 140,
        strokeColor: "#16a34a",
        fillColor: "#bbf7d0",
        strokeWidth: 1,
        text: "",
        points: []
      };

      return [col1, title1, note1, note2, col2, title2, note3, col3, title3, note4];
    }
  },
  {
    id: "retro",
    title: "Sprint Retrospective",
    description: "Clean retrospective columns with headers and blank cards",
    category: "Agile",
    generate: (originX, originY) => {
      const sectionW = 270;
      const gap = 30;

      const header: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: originX,
        y: originY,
        width: 400,
        height: 40,
        strokeColor: "#f8fafc",
        strokeWidth: 1,
        text: "Sprint Retrospective",
        fontSize: 28,
        points: []
      };

      const titleGood: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: originX,
        y: originY + 55,
        width: sectionW,
        height: 30,
        strokeColor: "#34d399",
        strokeWidth: 1,
        text: "WHAT WENT WELL 🎉",
        fontSize: 18,
        points: []
      };

      const noteGood: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX,
        y: originY + 95,
        width: sectionW,
        height: 160,
        strokeColor: "#16a34a",
        fillColor: "#bbf7d0",
        strokeWidth: 1,
        text: "",
        points: []
      };

      const titleImprove: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: originX + sectionW + gap,
        y: originY + 55,
        width: sectionW,
        height: 30,
        strokeColor: "#fb923c",
        strokeWidth: 1,
        text: "TO IMPROVE ⚠️",
        fontSize: 18,
        points: []
      };

      const noteImprove: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + sectionW + gap,
        y: originY + 95,
        width: sectionW,
        height: 160,
        strokeColor: "#ea580c",
        fillColor: "#fed7aa",
        strokeWidth: 1,
        text: "",
        points: []
      };

      const titleActions: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: originX + (sectionW + gap) * 2,
        y: originY + 55,
        width: sectionW,
        height: 30,
        strokeColor: "#818cf8",
        strokeWidth: 1,
        text: "ACTION ITEMS 🎯",
        fontSize: 18,
        points: []
      };

      const noteActions: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + (sectionW + gap) * 2,
        y: originY + 95,
        width: sectionW,
        height: 160,
        strokeColor: "#4f46e5",
        fillColor: "#c7d2fe",
        strokeWidth: 1,
        text: "",
        points: []
      };

      return [header, titleGood, noteGood, titleImprove, noteImprove, titleActions, noteActions];
    }
  },
  {
    id: "mindmap",
    title: "Mind Map",
    description: "Central topic node with branches and blank idea notes",
    category: "Architecture",
    generate: (originX, originY) => {
      const center: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: originX + 280,
        y: originY + 140,
        width: 180,
        height: 70,
        strokeColor: "#6366f1",
        fillColor: "rgba(99, 102, 241, 0.2)",
        strokeWidth: 2,
        text: "Main Topic",
        points: []
      };

      // Branch 1: Top Left
      const b1: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + 40,
        y: originY + 20,
        width: 170,
        height: 95,
        strokeColor: "#0284c7",
        fillColor: "#bae6fd",
        strokeWidth: 1,
        text: "",
        points: []
      };
      const arr1: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "line",
        x: originX + 210,
        y: originY + 70,
        width: 70,
        height: 70,
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        points: []
      };

      // Branch 2: Top Right
      const b2: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + 530,
        y: originY + 20,
        width: 170,
        height: 95,
        strokeColor: "#7c3aed",
        fillColor: "#ddd6fe",
        strokeWidth: 1,
        text: "",
        points: []
      };
      const arr2: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "line",
        x: originX + 530,
        y: originY + 70,
        width: -70,
        height: 70,
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        points: []
      };

      // Branch 3: Bottom Left
      const b3: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + 40,
        y: originY + 240,
        width: 170,
        height: 95,
        strokeColor: "#db2777",
        fillColor: "#fbcfe8",
        strokeWidth: 1,
        text: "",
        points: []
      };
      const arr3: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "line",
        x: originX + 210,
        y: originY + 280,
        width: 70,
        height: -70,
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        points: []
      };

      // Branch 4: Bottom Right
      const b4: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "sticky",
        x: originX + 530,
        y: originY + 240,
        width: 170,
        height: 95,
        strokeColor: "#16a34a",
        fillColor: "#bbf7d0",
        strokeWidth: 1,
        text: "",
        points: []
      };
      const arr4: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "line",
        x: originX + 530,
        y: originY + 280,
        width: -70,
        height: -70,
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        points: []
      };

      return [center, b1, arr1, b2, arr2, b3, arr3, b4, arr4];
    }
  }
];
