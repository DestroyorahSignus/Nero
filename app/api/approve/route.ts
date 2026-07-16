import { decide } from "@/lib/approvals";

export const runtime = "nodejs";

/**
 * POST /api/approve — the human side of the HITL gate.
 * Body: { id: string, approved: boolean }
 * The waiting run (possibly on another instance, via Redis) resolves
 * immediately. Unknown/expired/already-decided ids return ok:false.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { id?: string; approved?: boolean }
    | null;
  if (!body?.id || typeof body.approved !== "boolean") {
    return Response.json({ ok: false, error: "id and approved required" }, { status: 400 });
  }
  const ok = await decide(body.id, body.approved);
  return Response.json({ ok });
}
