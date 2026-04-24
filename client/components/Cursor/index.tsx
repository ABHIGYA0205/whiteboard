"use client";

import { useBoardStore } from "@/store/boardStore";

export function CursorLayer() {
  const cursors = useBoardStore((state) => Object.values(state.remoteCursors));
  const viewport = useBoardStore((state) => state.viewport);

  return (
    <div className="cursor-layer">
      {cursors.map((cursor) => (
        <div
          className="remote-cursor"
          key={cursor.userId}
          style={{
            transform: `translate(${viewport.x + cursor.x * viewport.zoom}px, ${
              viewport.y + cursor.y * viewport.zoom
            }px)`,
            borderColor: cursor.color
          }}
        >
          <span style={{ backgroundColor: cursor.color }} />
          <label>{cursor.userId.slice(0, 6)}</label>
        </div>
      ))}
    </div>
  );
}
