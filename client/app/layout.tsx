import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import fs from "node:fs";
import path from "node:path";

export const metadata: Metadata = {
  title: "Whiteboard — Infinite Collaborative Canvas",
  description: "Collaborative whiteboard with live drawing, smart templates, and AI sketch enhancement.",
  icons: {
    icon: "/icon.svg"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#010409"
};

function getInlineStyles(): string {
  try {
    const candidatePaths = [
      path.join(process.cwd(), "styles", "globals.css"),
      path.join(process.cwd(), "client", "styles", "globals.css")
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf8");
      }
    }
  } catch {
    // fallback if file read fails
  }
  return "";
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const inlineStyles = getInlineStyles();

  return (
    <html
      lang="en"
      data-theme="dark"
      style={{
        margin: 0,
        padding: 0,
        background: "#010409",
        colorScheme: "dark"
      }}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {inlineStyles ? (
          <style
            id="whiteboard-core-styles"
            dangerouslySetInnerHTML={{ __html: inlineStyles }}
          />
        ) : null}
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#010409",
          color: "#ececf1",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          overflow: "hidden"
        }}
      >
        {children}
      </body>
    </html>
  );
}

