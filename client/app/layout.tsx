import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Canvas Flow",
  description: "Sketch plans, map workflows, and work together live on a shared whiteboard.",
  referrer: "no-referrer",
  icons: {
    icon: [
      { url: "/favicon.ico?v=cf3", sizes: "any" },
      { url: "/icon.png?v=cf3", type: "image/png", sizes: "64x64" },
      { url: "/icon.svg?v=cf3", type: "image/svg+xml" }
    ],
    shortcut: "/favicon.ico?v=cf3",
    apple: "/icon.png?v=cf3"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-to-zoom allowed for mobile accessibility
  themeColor: "#010409"
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
        <link rel="icon" href="/favicon.ico?v=cf3" sizes="any" />
        <link rel="icon" href="/icon.png?v=cf3" type="image/png" sizes="64x64" />
        <link rel="icon" href="/icon.svg?v=cf3" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.png?v=cf3" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#010409",
          color: "#ececf1",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          minHeight: "100vh",
          overflowX: "hidden"
        }}
      >
        {children}
      </body>
    </html>
  );
}

