import { modelLabel, activeProvider } from "@/lib/providers";

export const runtime = "nodejs";

/** Deployment config surfaced to the console header — provider, models, mode, budget. */
export async function GET() {
  return Response.json({
    provider: activeProvider(),
    models: {
      planner: modelLabel("planner"),
      executor: modelLabel("executor"),
      critic: modelLabel("critic"),
    },
    yamatoMode: (process.env.YAMATO_MODE ?? "local").toLowerCase(),
    budgetTokens: Number(process.env.NERO_TOKEN_BUDGET ?? 150_000),
    searchConfigured: Boolean(process.env.TAVILY_API_KEY),
    memoryDurable: Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
    ),
  });
}
