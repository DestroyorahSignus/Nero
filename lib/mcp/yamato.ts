import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { ARSENAL } from "@/lib/tools/registry";

/**
 * YAMATO — the katana that opens portals. The executor never touches tool
 * implementations directly; it asks YAMATO for a ToolSet.
 *
 * Two modes (env YAMATO_MODE):
 *  - "local"  (default): in-process tool registry. Zero latency, no extra
 *    hop — the right call when agent and tools ship in the same deployment.
 *  - "remote": a genuine MCP client over Streamable HTTP against this app's
 *    own /api/mcp server (or any other MCP server via NERO_SELF_URL).
 *    Demonstrates the full protocol round-trip; costs one HTTP hop per call.
 */
export interface YamatoSession {
  tools: ToolSet;
  mode: "local" | "remote";
  close: () => Promise<void>;
}

export async function drawYamato(): Promise<YamatoSession> {
  const mode = (process.env.YAMATO_MODE ?? "local").toLowerCase();

  if (mode === "remote") {
    const base =
      process.env.NERO_SELF_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (!base) {
      throw new Error(
        "YAMATO_MODE=remote requires NERO_SELF_URL (or VERCEL_URL) to locate the MCP server.",
      );
    }
    const client = await createMCPClient({
      transport: {
        type: "http",
        url: `${base}/api/mcp/mcp`,
      },
      name: "nero-orchestrator",
    });
    const tools = await client.tools();
    return {
      tools,
      mode: "remote",
      close: () => client.close(),
    };
  }

  return {
    tools: ARSENAL as unknown as ToolSet,
    mode: "local",
    close: async () => {},
  };
}
