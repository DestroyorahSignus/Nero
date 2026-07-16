import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NERO — Neural Executive & Reasoning Orchestrator",
  description:
    "An MCP-orchestrated planner → executor → critic multi-agent system with live agent-graph visualization, Reflexion self-correction and hard cost guardrails.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Fonts load from Google Fonts at runtime with a graceful system
            fallback baked into globals.css, so the build never depends on
            network access to a font CDN. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-void text-bone">{children}</body>
    </html>
  );
}
