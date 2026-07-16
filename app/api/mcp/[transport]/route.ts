import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { ARSENAL } from "@/lib/tools/registry";

export const runtime = "nodejs";
export const maxDuration = 300; // Hobby-safe; raise to 800 on Vercel Pro

/**
 * YAMATO's far side: NERO's arsenal exposed as a real MCP server over
 * Streamable HTTP at /api/mcp/mcp. Any MCP host (Claude Desktop, Cursor,
 * or NERO itself in YAMATO_MODE=remote) can connect to it.
 *
 * Tool logic lives in lib/tools/* — this route only adapts the AI SDK tool
 * shape to MCP content blocks, so there is exactly one implementation.
 */
const handler = createMcpHandler(
  (server) => {
    server.tool(
      "web_search",
      "Search the web for current information (Tavily-backed).",
      { query: z.string().min(2), maxResults: z.number().int().min(1).max(6).default(3) },
      async (args) => mcpText(await call(ARSENAL.web_search, args)),
    );
    server.tool(
      "web_fetch",
      "Fetch a URL and return stripped text content.",
      { url: z.string().url() },
      async (args) => mcpText(await call(ARSENAL.web_fetch, args)),
    );
    server.tool(
      "run_js",
      "Execute a JavaScript snippet in an isolated sandbox (2s CPU limit, no I/O).",
      { code: z.string().min(1).max(6000) },
      async (args) => mcpText(await call(ARSENAL.run_js, args)),
    );
    server.tool(
      "csv_describe",
      "Profile a CSV dataset (row count, per-column stats).",
      { csv: z.string().min(10) },
      async (args) => mcpText(await call(ARSENAL.csv_describe, args)),
    );
    server.tool(
      "csv_aggregate",
      "Group a CSV by a column and aggregate a numeric column.",
      {
        csv: z.string().min(10),
        groupBy: z.string(),
        metric: z.string(),
        agg: z.enum(["sum", "mean", "count", "min", "max"]).default("sum"),
      },
      async (args) => mcpText(await call(ARSENAL.csv_aggregate, args)),
    );
  },
  {},
  {
    basePath: "/api/mcp",
    maxDuration: 300,
    verboseLogs: false,
    // Optional: Redis enables Streamable HTTP session resumption across
    // serverless instances. Works without it for stateless tool calls.
    redisUrl: process.env.REDIS_URL,
  },
);

function mcpText(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

/**
 * Invoke a tool's execute() outside the agent loop. The MCP server has no
 * model context to pass, so we adapt the AI SDK ToolExecutionOptions shape
 * with a synthetic call id. Typed loosely on purpose: this path is a plain
 * RPC, not a loop step.
 */
type AnyTool = { execute?: (args: unknown, opts: unknown) => Promise<unknown> };
function call(toolDef: unknown, args: unknown): Promise<unknown> {
  const t = toolDef as AnyTool;
  if (!t.execute) throw new Error("tool has no execute()");
  return t.execute(args, {
    toolCallId: crypto.randomUUID(),
    messages: [],
    context: undefined,
  });
}

// Initialize arrives over POST, stream reads over GET, session teardown over
// DELETE — export all three or clients see empty capabilities.
export { handler as GET, handler as POST, handler as DELETE };
