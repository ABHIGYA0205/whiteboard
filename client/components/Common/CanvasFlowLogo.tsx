import React from "react";

interface CanvasFlowLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CanvasFlowLogo({ size = 32, className, style }: CanvasFlowLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id="cf-component-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="cf-component-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
        <filter id="cf-component-shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.3" />
        </filter>
      </defs>
      {/* Squircle Base with subtle inner glow */}
      <rect width="64" height="64" rx="16" fill="url(#cf-component-bg)" />
      <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1.2" />

      {/* Canvas Layer: Rotated rounded card representing the infinite board */}
      <g filter="url(#cf-component-shadow)">
        {/* Canvas frame */}
        <rect x="13" y="13" width="38" height="38" rx="9" fill="#0b0f19" fillOpacity="0.35" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1.5" />

        {/* Flow Stroke / Dynamic Brush wave loop */}
        <path
          d="M38 18 C46 18, 48 25, 43 30 C37 36, 20 32, 20 41 C20 46, 26 48, 33 46 C39 44, 43 40, 46 35"
          fill="none"
          stroke="#ffffff"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M38 18 C46 18, 48 25, 43 30 C37 36, 20 32, 20 41 C20 46, 26 48, 33 46 C39 44, 43 40, 46 35"
          fill="none"
          stroke="url(#cf-component-stroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Glowing stylus / spark head */}
        <circle cx="46" cy="35" r="3.2" fill="#ffffff" />
        <circle cx="46" cy="35" r="1.6" fill="#38bdf8" />
      </g>
    </svg>
  );
}
