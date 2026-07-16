import { trish } from "@/lib/memory/trish";

export const runtime = "nodejs";

/** TRISH's long-term memory: the last runs for the history panel. */
export async function GET() {
  const runs = await trish.recentRuns(12);
  return Response.json({ runs });
}
