import React from 'react';

/**
 * SVG hex-nut / washer logo for the shell bar and login screen.
 * Inline SVG – no external assets required.
 */
export default function HexNutLogo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Outer hexagon */}
      <polygon
        points="32,4 56,18 56,46 32,60 8,46 8,18"
        fill="#0070F2"
        stroke="#0064D9"
        strokeWidth="2"
      />
      {/* Inner hex cutout */}
      <polygon
        points="32,16 44,23 44,37 32,44 20,37 20,23"
        fill="#0A1F44"
      />
      {/* Washer ring highlight */}
      <circle cx="32" cy="30" r="6" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
      {/* Center dot */}
      <circle cx="32" cy="30" r="3" fill="white" opacity="0.9" />
    </svg>
  );
}
