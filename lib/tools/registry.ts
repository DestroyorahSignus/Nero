import { webSearch, webFetch } from "./blue-rose";
import { runJs } from "./nico";
import { csvDescribe, csvAggregate } from "./kalina-ann";

/**
 * Single source of truth for NERO's arsenal. The same definitions power:
 *  1. the in-process executor (YAMATO local mode), and
 *  2. the MCP server at /api/mcp (YAMATO remote mode / external MCP hosts
 *     like Claude Desktop or Cursor can connect to it too).
 */
export const ARSENAL = {
  web_search: webSearch,
  web_fetch: webFetch,
  run_js: runJs,
  csv_describe: csvDescribe,
  csv_aggregate: csvAggregate,
} as const;

export type ArsenalToolName = keyof typeof ARSENAL;

export const TOOL_META: Record<
  ArsenalToolName,
  { server: "BLUE ROSE" | "NICO" | "KALINA ANN"; blurb: string }
> = {
  web_search: { server: "BLUE ROSE", blurb: "Web search (Tavily)" },
  web_fetch: { server: "BLUE ROSE", blurb: "Fetch & strip a URL" },
  run_js: { server: "NICO", blurb: "Sandboxed JS execution" },
  csv_describe: { server: "KALINA ANN", blurb: "Dataset profiling" },
  csv_aggregate: { server: "KALINA ANN", blurb: "Group-by aggregation" },
};
