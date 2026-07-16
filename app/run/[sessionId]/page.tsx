import Link from "next/link";
import { trish } from "@/lib/memory/trish";
import type { NeroUIMessage } from "@/ai/types";
import { ReplayConsole } from "@/components/console/ReplayConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /run/[sessionId] — shareable replay permalink.
 * A completed run's UIMessage snapshot is loaded from TRISH and folded
 * through the exact same derivation the live console uses. No API keys,
 * no LLM calls — a recruiter clicks a link and sees the full mission.
 */
export default async function ReplayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const snapshot = (await trish.getReplay(sessionId)) as
    | NeroUIMessage[]
    | null;

  if (!snapshot || !Array.isArray(snapshot)) {
    return (
      <main className="console-atmosphere flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-4xl font-bold italic text-edge">
          NO RECORD
        </p>
        <p className="font-mono mt-3 max-w-md text-xs leading-relaxed text-mist">
          TRISH has no memory of mission{" "}
          <span className="text-bone/70">{sessionId.slice(0, 8)}…</span> —
          replays live for 7 days with durable memory (Upstash), or until the
          instance recycles without it.
        </p>
        <Link
          href="/run"
          className="font-display cut-sm mt-6 border border-spectral bg-spectral/10 px-6 py-2.5 text-xs font-semibold tracking-widest text-spectral transition hover:bg-spectral/25"
        >
          RUN A NEW MISSION
        </Link>
      </main>
    );
  }

  return <ReplayConsole messages={snapshot} sessionId={sessionId} />;
}
