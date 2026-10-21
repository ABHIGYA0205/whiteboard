"use client";

import { useBoardStore } from "@/store/boardStore";

export function CursorLayer() {
  const cursors = useBoardStore((state) => Object.values(state.remoteCursors));
  const viewport = useBoardStore((state) => state.viewport);

  return (
    <div className="cursor-layer" aria-hidden="true">
      {cursors.map((cursor) => {
        const screenX = viewport.x + cursor.x * viewport.zoom;
        const screenY = viewport.y + cursor.y * viewport.zoom;
        const color = cursor.color || "#3b82f6";
        const displayName = cursor.name || `User-${cursor.userId.slice(0, 4)}`;

        return (
          <div
            className="remote-cursor"
            key={cursor.userId}
            style={{
              transform: `translate3d(${screenX}px, ${screenY}px, 0)`
            }}
          >
            {/* Authentic Figma/Canva pointer SVG */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))",
                transform: "translate(-2px, -2px)"
              }}
            >
              <path
                d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
                fill={color}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            {/* Pill name tag */}
            <div
              className="remote-cursor-badge"
              style={{ backgroundColor: color }}
            >
              {displayName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
