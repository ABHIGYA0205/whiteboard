"use client";

import React, { useRef, useEffect } from "react";

export function DashboardVideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Guarantee continuous infinite autoplay
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback retry if needed
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }, []);

  return (
    <div
      style={{
        position: "relative",
        marginTop: "3.5rem",
        width: "100%",
        maxWidth: "1080px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}
    >
      {/* Ambient Glow Backdrop */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "8%",
          left: "4%",
          right: "4%",
          bottom: "8%",
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(99, 102, 241, 0.25) 0%, rgba(168, 85, 247, 0.16) 45%, rgba(56, 189, 248, 0.08) 75%, transparent 100%)",
          filter: "blur(65px)",
          borderRadius: "28px",
          pointerEvents: "none",
          zIndex: 0,
          transform: "scale(1.03)",
          opacity: 0.95
        }}
      />

      {/* Main Video Frame / macOS Window */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          borderRadius: "18px",
          background: "#0c0d16",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow:
            "0 25px 65px -15px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.04), 0 12px 28px -10px rgba(99, 102, 241, 0.18)",
          overflow: "hidden"
        }}
      >
        {/* Window Nav Bar (Clean macOS header with traffic lights, no overlapping text/badges) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "linear-gradient(180deg, #131522 0%, #0e101a 100%)",
            userSelect: "none"
          }}
        >
          {/* macOS Traffic Lights */}
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#ff5f56",
                boxShadow: "0 0 5px rgba(255, 95, 86, 0.4)",
                display: "inline-block"
              }}
            />
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#ffbd2e",
                boxShadow: "0 0 5px rgba(255, 189, 46, 0.4)",
                display: "inline-block"
              }}
            />
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#27c93f",
                boxShadow: "0 0 5px rgba(39, 201, 63, 0.4)",
                display: "inline-block"
              }}
            />
          </div>
        </div>

        {/* Full Uncropped Video Display (Infinite loop, non-interactive) */}
        <div
          style={{
            width: "100%",
            lineHeight: 0,
            backgroundColor: "#000000",
            userSelect: "none"
          }}
        >
          <video
            ref={videoRef}
            src="/board-demo.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            controls={false}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              pointerEvents: "none"
            }}
          />
        </div>
      </div>
    </div>
  );
}
